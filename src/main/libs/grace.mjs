/**
 * GRACE — cloud client for THE-NILE.
 *
 * Pure HTTP helpers for talking to a NileCloud server (login, adding accounts,
 * reading members, and per-account session calls). Deliberately free of any
 * Electron import so it can be unit-tested with `node --test` and driven from a
 * plain Node CLI by AI agents.
 */

/** Strip trailing slashes so `http://host/` and `http://host` behave the same. */
function normalizeServer(server) {
  const value = String(server || "").trim();
  return value.replace(/\/+$/, "");
}

/**
 * Perform a JSON request against the cloud server and throw a readable error
 * carrying the server's own message when it rejects.
 *
 * @param {string} server Base URL, e.g. `http://3.238.238.69`
 * @param {string} path   Path beginning with `/`
 * @param {object} [options]
 * @param {string} [options.method]  HTTP method, defaults to `GET`
 * @param {string} [options.token]   Manager JWT, sent as a bearer token
 * @param {object} [options.body]    JSON body; omitted entirely when undefined
 * @returns {Promise<any>} parsed response body
 */
async function request(server, path, options = {}) {
  const { method = "GET", token, body } = options;
  const url = `${normalizeServer(server)}${path}`;

  /** @type {Record<string,string>} */
  const headers = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      (data && typeof data === "object" && (data.message || data.error)) ||
      text ||
      `HTTP ${response.status}`;
    throw new Error(`${method} ${path} failed (${response.status}): ${message}`);
  }

  return data;
}

/**
 * Expand a human account range into 1-based account numbers.
 *
 * Accepts `all`, `5`, `1-139`, and comma lists such as `3-5,8`.
 *
 * @param {string} spec  Range expression
 * @param {number} total Highest account number known to THE-NILE
 * @returns {number[]} sorted, de-duplicated account numbers
 */
export function parseRange(spec, total) {
  const text = String(spec ?? "").trim();
  if (!text) throw new Error("Account range is empty");

  const limit = Number(total);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`Invalid account total: ${total}`);
  }

  const fail = (part) => {
    throw new Error(`Invalid account range "${part}" in "${spec}"`);
  };

  if (/^all$/i.test(text)) {
    return Array.from({ length: limit }, (_, index) => index + 1);
  }

  const numbers = new Set();

  for (const part of text.split(",")) {
    const piece = part.trim();
    if (!piece) fail(part);

    const range = piece.match(/^(\d+)\s*-\s*(\d+)$/);
    const single = piece.match(/^(\d+)$/);

    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from > to) fail(piece);
      if (from < 1 || to > limit) {
        throw new Error(
          `Account range "${piece}" is outside the known accounts (1-${limit})`,
        );
      }
      for (let value = from; value <= to; value += 1) numbers.add(value);
      continue;
    }

    if (single) {
      const value = Number(single[1]);
      if (value < 1 || value > limit) {
        throw new Error(
          `Account "${piece}" is outside the known accounts (1-${limit})`,
        );
      }
      numbers.add(value);
      continue;
    }

    fail(piece);
  }

  return [...numbers].sort((a, b) => a - b);
}

/**
 * Log into the Cloud Manager and return the JWT plus the manager user.
 *
 * The token carries no `exp` claim — treat it as a long-lived secret.
 *
 * @param {string} server
 * @param {{email: string, password: string}} credentials
 * @returns {Promise<{token: string, user: object}>}
 */
export async function login(server, { email, password } = {}) {
  if (!email || !password) {
    throw new Error("login requires an email and password");
  }
  const data = await request(server, "/api/manager/login", {
    method: "POST",
    body: { email, password },
  });
  if (!data || typeof data.token !== "string" || !data.token) {
    throw new Error("login response carried no token");
  }
  return { token: data.token, user: data.user ?? null };
}

/**
 * Register accounts on the cloud server and give them a subscription.
 *
 * The server's handler runs `Account.findOrCreate`, so this single call both
 * creates missing members and creates or extends their subscription.
 *
 * Large ranges are sent in chunks: the server writes SQLite without WAL, and a
 * 187-row transaction reliably loses the lock to its own background worker with
 * `SQLITE_BUSY`. Chunks are small enough to commit, and a failed chunk is
 * retried with a backoff instead of failing the whole range.
 *
 * @param {string} server
 * @param {{token: string, ids: number[]|string[], date?: string,
 *          chunkSize?: number, retries?: number}} options
 * @returns {Promise<any[]>} one response per chunk
 */
export async function addAccounts(
  server,
  { token, ids, date, chunkSize = 25, retries = 4 } = {},
) {
  if (!token) throw new Error("addAccounts requires a manager token");
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("addAccounts requires at least one account id");
  }

  const responses = [];

  for (let start = 0; start < ids.length; start += chunkSize) {
    const chunk = ids.slice(start, start + chunkSize);
    const body = { id: chunk.map(String).join(" ") };
    if (date) body.date = date;

    let attempt = 0;
    for (;;) {
      try {
        responses.push(
          await request(server, "/api/manager/members/subscription", {
            method: "POST",
            token,
            body,
          }),
        );
        break;
      } catch (error) {
        attempt += 1;
        const busy = /SQLITE_BUSY|database is locked/i.test(error.message);
        if (attempt >= retries || !busy) throw error;

        /* Let the worker's write drain before trying the same chunk again. */
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }

  return responses;
}

/**
 * Read every member the cloud server knows about.
 *
 * @param {string} server
 * @param {{token: string}} options
 * @returns {Promise<object[]>}
 */
export async function members(server, { token } = {}) {
  if (!token) throw new Error("members requires a manager token");
  const data = await request(server, "/api/manager/members", { token });
  return Array.isArray(data) ? data : [];
}

/**
 * Read the cloud session attached to one account.
 *
 * Authenticates with the account's own Telegram initData rather than the
 * manager JWT, on the farmer-facing route the server guards with Ed25519
 * signature validation.
 *
 * @param {string} server
 * @param {{initData: string}} options
 * @returns {Promise<{session: string|null}>}
 */
export async function farmerSession(server, { initData } = {}) {
  if (!initData) throw new Error("farmerSession requires initData");
  return request(server, "/api/session", {
    method: "POST",
    body: { auth: initData },
  });
}

/* ── Telegram login flow ────────────────────────────────────────────── *
 *
 * Minting an account's cloud session runs phone → code → optional 2FA on the
 * server. `/code` refuses with 403 "Not allowed!" unless the account already
 * has an active subscription, so `addAccounts` is a prerequisite.
 */

/* ── account loading ───────────────────────────────────────────────────── */

/**
 * Pull the Telegram user id out of a mini-app initData string.
 *
 * @param {string} initData
 * @returns {number|null} null when the string carries no usable user id
 */
export function telegramIdFromInitData(initData) {
  if (typeof initData !== "string" || !initData) return null;
  try {
    const raw = new URLSearchParams(initData).get("user");
    if (!raw) return null;
    const id = Number(JSON.parse(raw)?.id);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Read THE-NILE's config.json into accounts GRACE can work with.
 *
 * The two stores are JSON encoded *inside* strings, so they need a second parse.
 * `index` is the 1-based position of the account in the app, which is what the
 * `Account N` titles and any `1-139` range refer to.
 *
 * @param {string|object} configJson contents of config.json
 * @returns {{index: number, title: string, id: number, initData: string}[]}
 * @throws when the config holds no accounts at all
 */
export function accountsFromConfig(configJson) {
  const config =
    typeof configJson === "string" ? JSON.parse(configJson) : configJson;

  let store = null;
  try {
    store = JSON.parse(config?.["app-store"]);
  } catch {
    store = null;
  }

  const accounts = store?.state?.accounts;
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error("Config holds no accounts (expected app-store.state.accounts)");
  }

  const rows = [];
  accounts.forEach((account, position) => {
    const initData = account?.telegramInitData;
    const id = telegramIdFromInitData(initData);
    if (id === null) return;
    rows.push({
      index: position + 1,
      title: account.title || `Account ${position + 1}`,
      id,
      initData,
    });
  });

  return rows;
}

/**
 * Read THE-NILE's config.json into the account → partition mapping.
 *
 * `accountsFromConfig` drops accounts without a usable initData, so its rows
 * are not index-aligned with the stored array. This keeps every position, so
 * the 1-based `index` still refers to the same account in both views.
 *
 * @param {string|object} configJson contents of config.json
 * @returns {{index: number, partition: string|null}[]}
 */
export function partitionsFromConfig(configJson) {
  const config =
    typeof configJson === "string" ? JSON.parse(configJson) : configJson;

  let store = null;
  try {
    store = JSON.parse(config?.["app-store"]);
  } catch {
    store = null;
  }

  const accounts = store?.state?.accounts;
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error("Config holds no accounts (expected app-store.state.accounts)");
  }

  return accounts.map((account, position) => ({
    index: position + 1,
    partition: account?.partition ?? null,
  }));
}

/**
 * Which selected accounts still have to be added on the cloud server.
 *
 * `/api/telegram/code` refuses with 403 "Not allowed!" unless the account has
 * an active subscription, so minting a session for an account that was never
 * added fails *after* Telegram has already sent a code — and the account stays
 * unauthenticated. Checking first turns that into one batch call.
 *
 * @param {{index: number, id: number}[]} picked
 * @param {{id: number|string, subscriptions?: unknown[]}[]} members
 * @returns {{index: number, id: number}[]}
 */
export function accountsNeedingRegistration(picked, members) {
  const byId = new Map();
  for (const row of members ?? []) byId.set(String(row?.id), row);

  return (picked ?? []).filter((account) => {
    const row = byId.get(String(account.id));
    if (!row) return true;
    return !(Array.isArray(row.subscriptions) && row.subscriptions.length > 0);
  });
}

/**
 * Start a Telegram login for one phone number.
 *
 * @param {string} server
 * @param {string} phone
 * @returns {Promise<{session: string}>} the server's session id
 */
export async function telegramLoginStart(server, phone) {
  if (!phone) throw new Error("telegramLoginStart requires a phone number");
  return request(server, "/api/telegram/login", {
    method: "POST",
    body: { phone },
  });
}

/**
 * Submit the login code for a started session.
 *
 * @param {string} server
 * @param {{session: string, code: string}} options
 * @returns {Promise<object>} includes `user` once Telegram has authenticated
 */
export async function telegramLoginCode(server, { session, code } = {}) {
  if (!session || !code) {
    throw new Error("telegramLoginCode requires a session and code");
  }
  return request(server, "/api/telegram/code", {
    method: "POST",
    body: { session, code },
  });
}

/**
 * Submit the 2FA password for a started session.
 *
 * @param {string} server
 * @param {{session: string, password: string}} options
 * @returns {Promise<object>} includes `user` once Telegram has authenticated
 */
export async function telegramLoginPassword(server, { session, password } = {}) {
  if (!session || !password) {
    throw new Error("telegramLoginPassword requires a session and password");
  }
  return request(server, "/api/telegram/password", {
    method: "POST",
    body: { session, password },
  });
}

/* ── CLI argument parsing ───────────────────────────────────────────── */

/** Flags that take no value. */
const BOOLEAN_FLAGS = new Set([
  "json",
  "help",
  "quick",
  "no-point",
  "dry-run",
  "no-extension",
  "remint",
  "verify-only",
  "sign",
]);

/** Flags that must be followed by a value. */
const VALUE_FLAGS = new Set([
  "server",
  "date",
  "phones",
  "email",
  "password",
  "passwords",
  "code-timeout",
  "ssh",
  "key",
  "vault",
  "pool",
]);

/**
 * Parse GRACE's command line into a plain object.
 *
 * Kept here, pure and side-effect free, so the parser is covered by unit tests
 * rather than only exercised by hand.
 *
 * @param {string[]} argv arguments after the script name
 * @returns {{command: string|null, range: string, server: string|null,
 *            date: string|null, phones: string|null, email: string|null,
 *            password: string|null, passwords: string|null, quick: boolean,
 *            codeTimeout: string|null, json: boolean, help: boolean,
 *            ssh: string|null, key: string|null, vault: string|null,
 *            pool: string|null, verifyOnly: boolean, sign: boolean,
 *            positionals: string[]}}
 */
export function parseCliArgs(argv = []) {
  const parsed = {
    command: null,
    range: "all",
    server: null,
    date: null,
    phones: null,
    email: null,
    password: null,
    passwords: null,
    quick: false,
    noPoint: false,
    dryRun: false,
    noExtension: false,
    remint: false,
    codeTimeout: null,
    json: false,
    help: false,
    ssh: null,
    key: null,
    vault: null,
    pool: null,
    verifyOnly: false,
    sign: false,
  };

  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const name = arg.slice(2);

    if (BOOLEAN_FLAGS.has(name)) {
      if (name === "no-point") parsed.noPoint = true;
      else if (name === "dry-run") parsed.dryRun = true;
      else if (name === "no-extension") parsed.noExtension = true;
      else if (name === "verify-only") parsed.verifyOnly = true;
      else parsed[name] = true;
      continue;
    }

    if (!VALUE_FLAGS.has(name)) {
      throw new Error(`Unknown flag --${name}`);
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Flag --${name} requires a value`);
    }
    index += 1;

    /* `--code-timeout` maps to `codeTimeout`, matching how every other flag
     * keeps its name as-is. */
    if (name === "code-timeout") parsed.codeTimeout = value;
    else parsed[name] = value;
  }

  parsed.command = positionals[0] ?? null;
  parsed.positionals = positionals;

  /* `wallets <farmer> [range]` — the first positional is the farmer id, so the
   * range is the second one. Every other command has the range first. */
  if (parsed.command === "wallets") {
    if (positionals[2]) parsed.range = positionals[2];
  } else if (positionals[1]) {
    parsed.range = positionals[1];
  }

  return parsed;
}

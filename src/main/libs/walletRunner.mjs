/**
 * GRACE — server-side wallet runner.
 *
 * `grace wallets` copies this file to the farm server and runs it there,
 * because that is where the Telegram sessions, the proxies and each farmer's
 * HTTP flows live. It is never imported by the app.
 *
 * Usage (on the server, from apps/nilecloud):
 *   node tmp-wallet-runner.mjs --farmer=lootvault --plan=plan.json \
 *     [--dry] [--pool=1] [--verify-only] [--secrets=stdin] \
 *     [--log=/tmp/wallets-lootvault.log]
 *
 * The plan is the work list GRACE built from NileVault:
 *   [{ position, telegramId, address, rawAddress }]
 *
 * Accounts run through the production `farmers/Runner.js`, so the proxy
 * agents, user agent, cookies, retry/delay interceptors and each bot's own
 * `configureApi()` (MRG authenticates every call through one) are exactly what
 * farming uses. This file only adds the wallet step.
 *
 * Bots that bind by signed proof (MRG) need the wallet phrase. It arrives on
 * stdin when GRACE passes `--secrets=stdin`, is held for that account's call,
 * and is never written to the plan, the log or the process arguments.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import db from "./db/models/index.js";
import utils from "./lib/utils.js";
import GramClient from "./lib/GramClient.js";
import createRunner from "./farmers/Runner.js";
import { discoverFarmerClasses } from "./farmers/discover.js";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};

const farmerId = arg("farmer");
const planPath = arg("plan");
const poolSize = Math.max(1, Number(arg("pool", 1)));
const dry = process.argv.includes("--dry");
const verifyOnly = process.argv.includes("--verify-only");
const secretsFromStdin = arg("secrets") === "stdin";
const logPath = arg("log", `/tmp/wallets-${farmerId}.log`);

if (!farmerId || !planPath) {
  console.error("usage: node tmp-wallet-runner.mjs --farmer=<id> --plan=<file>");
  process.exit(2);
}

const log = (entry) => {
  fs.appendFileSync(logPath, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
  if (!entry.result) return;

  const detail =
    entry.result === "failed"
      ? ` — ${JSON.stringify(entry.error)}`
      : entry.result === "rebound" || entry.result === "would-rebind"
        ? ` (was ${String(entry.from ?? "unknown").slice(0, 12)}…, now ${String(entry.verified ?? "?").slice(0, 12)}…)`
        : entry.note
          ? ` (${entry.note})`
          : "";
  console.log(`[${entry.position}] ${entry.result}${detail}${entry.ms ? `  ${entry.ms}ms` : ""}`);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ── farmer discovery ─────────────────────────────────────────────────── */

/**
 * Find the farmer class by its static id.
 *
 * The same discovery the farm itself uses, so a bot added to @nile/shared is
 * immediately addressable by `grace wallets <id>`.
 */
async function findFarmer(id) {
  /* Relative to this file, not the caller's cwd: the runner is scp'd into
   * apps/nilecloud and must find the same node_modules from anywhere. */
  const appDir = path.dirname(fileURLToPath(import.meta.url));
  const dir = path.join(appDir, "node_modules/@nile/shared/farmers");
  const classes = await discoverFarmerClasses(dir);
  return classes.find((FarmerClass) => FarmerClass?.id === id) ?? null;
}

/* ── per-bot read adapter ─────────────────────────────────────────────── */

/**
 * Read the wallet a bot currently has, without writing anything.
 *
 * Bots not listed here still bind (their own flow handles it); they simply
 * cannot be verified afterwards, and the runner says so rather than claiming
 * success.
 */
const WALLET_READERS = {
  async lootvault(farmer) {
    const balances = await farmer.getBalances();
    return (balances?.wallets ?? []).find((wallet) => wallet.active)?.addr ?? null;
  },
  async slpy(farmer) {
    await farmer.login();
    return farmer.user_data?.["wallet_address"] ?? null;
  },
  async tonoreum(farmer) {
    await farmer.login();
    return farmer.user_data?.["wallet_address"] ?? null;
  },
  async mrg(farmer) {
    await farmer.loadAccount();
    return farmer.getConnectedWalletAddress();
  },
};

/** True when two addresses are the same wallet, tolerating EQ/UQ forms. */
function sameWallet(a, b) {
  if (!a || !b) return false;
  const left = String(a).trim().toLowerCase();
  const right = String(b).trim().toLowerCase();
  if (left === right) return true;
  const friendly = /^(eq|uq)/;
  if (friendly.test(left) && friendly.test(right)) {
    return left.slice(2) === right.slice(2);
  }
  return false;
}

/* ── per-account setup ────────────────────────────────────────────────── */

async function mintInitData(account, link) {
  const client = await GramClient.create(account.session, null);
  try {
    await client.connect();
    if (!client.connected) throw new Error("client did not connect");
    const { url } = await client.getWebview(link);
    const { initData } = utils.extractTgWebAppData(url);
    if (!initData) throw new Error("webview returned no init data");
    return initData;
  } finally {
    await client.disconnect?.().catch(() => {});
  }
}

/** A logger that records instead of printing, so a run's detail can be logged. */
function loggerInto(sink) {
  const push = (level) => (...parts) => {
    sink.push({ level, text: parts.filter((p) => typeof p === "string").join(" ") });
  };
  return {
    success: push("success"),
    info: push("info"),
    warn: push("warn"),
    error: push("error"),
    log: push("log"),
    debug: () => {},
    newline: () => {},
    keyValue: (key, value) => sink.push({ level: "kv", text: `${key}: ${value}` }),
    c: new Proxy({}, { get: () => (value) => value }),
  };
}

/**
 * Answer the farmer's prompts from the plan.
 *
 * Address prompts get the planned wallet. A phrase/version prompt gets the
 * secret GRACE supplied for this account — and if there is none, the call stops
 * before anything is signed or bound.
 */
function promptFrom({ address, secret, prompts }) {
  return async (question) => {
    const isSelect = question !== null && typeof question === "object";
    const text = isSelect ? String(question.text || "") : String(question || "");
    prompts.push(text);

    if (isSelect || /version|select/i.test(text)) {
      if (!secret?.version) {
        throw new Error(
          `this bot asks for a wallet version; re-run with --sign ("${text}")`,
        );
      }
      return secret.version;
    }

    if (/phrase|secret|seed|mnemonic|private\s*key/i.test(text)) {
      if (!secret?.phrase) {
        throw new Error(
          `this bot signs with the wallet phrase; re-run with --sign ("${text}")`,
        );
      }
      return secret.phrase;
    }

    return address;
  };
}

/** Bots that cannot bind from an address alone — they sign a proof. */
const PHRASE_BOTS = new Set(["mrg"]);

/* ── one account ──────────────────────────────────────────────────────── */

async function handle({ Runner, FarmerClass, supportsRegister, secrets }, entry) {
  const started = Date.now();
  const sink = [];
  const prompts = [];
  const finish = (result, extra = {}) => {
    log({
      ...entry,
      result,
      ms: Date.now() - started,
      prompts,
      messages: sink.filter((m) => m.level !== "log").slice(-12),
      ...extra,
    });
    return result;
  };

  if (!entry.address) return finish("skip", { note: "no wallet address" });

  /* Checked before minting or touching the account: a run without the phrase
   * must not leave a registered account behind. */
  if (PHRASE_BOTS.has(farmerId) && !verifyOnly && !secrets[String(entry.telegramId)]?.phrase) {
    return finish("skip", {
      note: "this bot binds with a signed proof; re-run with --sign",
    });
  }

  try {
    const account = await db.Account.findByPk(entry.telegramId, {
      include: [
        {
          association: "farmers",
          where: { farmer: farmerId },
          required: true,
        },
      ],
    });
    if (!account) throw new Error(`no ${farmerId} row for this account`);
    if (!account.proxy) throw new Error("no proxy on the account");

    const row = account.farmer;
    if (!row?.initData) {
      /* A dry run must not mint: minting is a Telegram round trip and a DB
       * write, and "dry" means nothing changes. */
      if (dry) {
        return finish("would-mint", {
          note: "no init data yet; a real run mints it",
        });
      }
      if (verifyOnly) {
        return finish("skip", { note: "no init data yet — nothing to verify" });
      }
      if (!account.session) throw new Error("no telegram session — cannot mint");
      row.initData = await mintInitData(account, FarmerClass.telegramLink);
      await row.save();
    }

    /* Constructed after the init data exists: the Runner reads it into the
     * farmer's Telegram WebApp on construction. */
    const farmer = new Runner(account);
    farmer.debug = false;
    farmer.logger = loggerInto(sink);

    const secret = secrets[String(entry.telegramId)] ?? null;
    farmer.walletAddress = entry.address;
    farmer.promptInput = promptFrom({ address: entry.address, secret, prompts });

    /** LootVault: a0 says registered-or-not, and registration binds the wallet. */
    if (supportsRegister) {
      const state = await farmer.verifyAccount();
      if (state?.maintenance) return finish("skip", { note: "maintenance" });

      const registered = state?.registered === true || state?.w === true;

      if (!registered) {
        if (verifyOnly) return finish("would-register", { note: "verify-only" });
        if (dry) return finish("would-register");

        const availability =
          typeof farmer.checkWallet === "function"
            ? await farmer.checkWallet(entry.address)
            : { available: true };
        if (!availability?.available) {
          throw new Error(
            availability?.own
              ? "wallet already bound to this account"
              : "wallet bound to another account",
          );
        }

        await farmer.register();
        const after = await WALLET_READERS[farmerId]?.(farmer).catch(() => null);
        return finish("registered", { verified: after ?? null, ok: sameWallet(after, entry.address) });
      }

      const current = await WALLET_READERS[farmerId]?.(farmer).catch(() => null);
      if (sameWallet(current, entry.address)) return finish("already", { verified: current, ok: true });
      if (verifyOnly) return finish("would-rebind", { from: current });
      if (dry) return finish("would-rebind", { from: current });

      await farmer.connectWalletInteractive();
      const after = await WALLET_READERS[farmerId]?.(farmer).catch(() => null);
      return finish("rebound", { from: current, verified: after ?? null, ok: sameWallet(after, entry.address) });
    }

    /** Every other wallet bot: its own connect flow, after loading state. */
    if (verifyOnly) {
      const reader = WALLET_READERS[farmerId];
      if (!reader) return finish("skip", { note: "no verifier for this bot" });

      const current = await reader(farmer).catch(() => null);
      if (sameWallet(current, entry.address)) {
        return finish("already", { verified: current, ok: true });
      }
      return finish("would-bind", { from: current });
    }

    if (dry) {
      return finish("would-bind", {
        from: null,
        note: "state not read in a dry run",
      });
    }

    const reader = WALLET_READERS[farmerId];
    const current = reader ? await reader(farmer).catch(() => null) : null;
    if (!reader) await farmer.login();

    if (sameWallet(current, entry.address)) return finish("already", { verified: current, ok: true });

    await farmer.connectWalletInteractive();
    const after = reader ? await reader(farmer).catch(() => null) : null;

    if (reader) {
      return finish("bound", {
        from: current,
        verified: after ?? null,
        ok: sameWallet(after, entry.address),
      });
    }

    return finish("bound", { from: current, verified: null, note: "no verifier for this bot" });
  } catch (error) {
    return finish("failed", {
      error: error?.response?.data ?? error.message,
    });
  }
}

/* ── main ─────────────────────────────────────────────────────────────── */

const FarmerClass = await findFarmer(farmerId);
if (!FarmerClass) {
  console.error(`unknown farmer "${farmerId}" — no @nile/shared farmer has that id`);
  process.exit(2);
}

if (typeof FarmerClass.prototype.connectWalletInteractive !== "function") {
  console.error(
    `${farmerId} has no wallet flow — its farmer never binds a wallet, so there is nothing for GRACE to do here.`,
  );
  process.exit(2);
}

/** Read the secrets GRACE piped in, before doing any work. */
async function readSecrets() {
  if (!secretsFromStdin) return {};
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

const secrets = await readSecrets();

const supportsRegister =
  typeof FarmerClass.prototype.register === "function" &&
  typeof FarmerClass.prototype.verifyAccount === "function";

const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
if (!Array.isArray(plan) || plan.length === 0) {
  console.error("plan is empty");
  process.exit(2);
}

/** Only this run's entries count; the log is appended across runs. */
const runStartedAt = new Date().toISOString();

const Runner = createRunner(FarmerClass);

console.log(
  `farmer ${farmerId}: ${plan.length} account(s), pool ${poolSize}` +
    `${dry ? ", dry run" : ""}${verifyOnly ? ", verify only" : ""}` +
    `${supportsRegister ? "" : ", bind only"}` +
    `${Object.keys(secrets).length ? ", with signing keys" : ""}`,
);

let cursor = 0;
let finished = 0;

await Promise.all(
  Array.from({ length: Math.min(poolSize, plan.length) }, async () => {
    while (cursor < plan.length) {
      const entry = plan[cursor];
      cursor += 1;
      await handle({ Runner, FarmerClass, supportsRegister, secrets }, entry);
      finished += 1;
      if (finished % 10 === 0) console.log(`— ${finished}/${plan.length} done`);
      await sleep(400);
    }
  }),
);

const all = fs
  .readFileSync(logPath, "utf8")
  .trim()
  .split("\n")
  .map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  })
  .filter(
    (entry) =>
      entry &&
      entry.at >= runStartedAt &&
      plan.some((p) => p.telegramId === entry.telegramId),
  );

const counts = {};
for (const entry of all) {
  if (entry.result) counts[entry.result] = (counts[entry.result] ?? 0) + 1;
}

console.log("TOTALS " + JSON.stringify(counts));

const bound = all.filter((e) => e.ok === true).length;
const unverified = all.filter(
  (e) => ["registered", "bound", "rebound"].includes(e.result) && e.ok !== true,
).length;
console.log(`verified ${bound}, unverified ${unverified}`);

const failed = counts.failed ?? 0;

/* The Runner installs timers and keep-alive agents; the work is done, so end
 * the process rather than wait for them. */
await Promise.race([db.sequelize.close().catch(() => {}), sleep(2000)]);
process.exit(failed > 0 ? 1 : 0);

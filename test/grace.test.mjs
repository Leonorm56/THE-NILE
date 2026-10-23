import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFileSync, spawn } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  existsSync,
  statSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  accountsFromConfig,
  accountsNeedingRegistration,
  addAccounts,
  farmerSession,
  login,
  members,
  parseCliArgs,
  parseRange,
  partitionsFromConfig,
  telegramLoginCode,
  telegramLoginPassword,
  telegramLoginStart,
} from "../src/main/libs/grace.mjs";
import {
  defaultGraceDir,
  readSession,
  sessionFilePath,
  writeSession,
} from "../src/main/libs/graceSession.mjs";

/**
 * A minimal stand-in for the NileCloud Fastify server: records every request it
 * receives so tests can assert on method, path, headers and body without ever
 * touching the real host.
 */
async function startServer(route) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      let body = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = raw;
      }
      seen.push({
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization || null,
        contentType: req.headers["content-type"] || null,
        body,
      });
      const reply = route(req, res, body) || {};
      res.writeHead(reply.status ?? 200, { "content-type": "application/json" });
      res.end(JSON.stringify(reply.body ?? {}));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    seen,
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/* ── parseRange ─────────────────────────────────────────────────────────── */

test("parseRange expands an inclusive 1-based range", () => {
  const range = parseRange("1-139", 187);
  assert.equal(range.length, 139);
  assert.equal(range[0], 1);
  assert.equal(range[138], 139);
});

test("parseRange treats 'all' as every known account", () => {
  assert.deepEqual(parseRange("all", 3), [1, 2, 3]);
});

test("parseRange accepts comma lists mixed with ranges", () => {
  assert.deepEqual(parseRange("3-5,8", 10), [3, 4, 5, 8]);
});

test("parseRange rejects a range that runs past the known accounts", () => {
  assert.throws(() => parseRange("1-200", 187), /187/);
});

test("parseRange rejects non-numeric input instead of silently no-oping", () => {
  assert.throws(() => parseRange("accounts", 10));
});

/* ── login ──────────────────────────────────────────────────────────────── */

test("login posts credentials and returns the manager token", async () => {
  const server = await startServer((req, res, body) => {
    if (req.url === "/api/manager/login") {
      assert.equal(body.email, "admin");
      assert.equal(body.password, "password");
      return {
        body: {
          user: { id: 1, username: "admin", email: "admin@example.com" },
          token: "jwt-token-value",
        },
      };
    }
    return { status: 404, body: { message: "Not Found" } };
  });

  try {
    const result = await login(server.url, {
      email: "admin",
      password: "password",
    });
    assert.equal(result.token, "jwt-token-value");
    assert.equal(result.user.id, 1);
    assert.equal(server.seen.length, 1);
    assert.equal(server.seen[0].method, "POST");
    assert.equal(server.seen[0].url, "/api/manager/login");
    assert.match(server.seen[0].contentType, /application\/json/);
  } finally {
    await server.close();
  }
});

test("login surfaces the server's own error message", async () => {
  const server = await startServer(() => ({
    status: 400,
    body: { message: "Incorrect Password!" },
  }));

  try {
    await assert.rejects(
      login(server.url, { email: "admin", password: "wrong" }),
      /Incorrect Password!/,
    );
  } finally {
    await server.close();
  }
});

/* ── addAccounts ────────────────────────────────────────────────────────── */

test("addAccounts splits a large range into chunks the server can commit", async () => {
  const server = await startServer((req) => {
    if (req.url === "/api/manager/members/subscription") {
      return { status: 200, body: { ok: true } };
    }
    return { status: 404, body: { message: "Not Found" } };
  });

  try {
    const ids = Array.from({ length: 60 }, (_, index) => 7000000000 + index);
    await addAccounts(server.url, { token: "t", ids });

    const posts = server.seen.filter(
      (entry) => entry.url === "/api/manager/members/subscription",
    );
    assert.equal(posts.length, 3);
    assert.equal(posts[0].body.id.split(" ").length, 25);
    assert.equal(posts[2].body.id.split(" ").length, 10);
  } finally {
    await server.close();
  }
});

test("addAccounts retries a chunk the database was too busy to take", async () => {
  let attempts = 0;
  const server = await startServer((req) => {
    if (req.url === "/api/manager/members/subscription") {
      attempts += 1;
      if (attempts === 1) {
        return { status: 500, body: { message: "SQLITE_BUSY: database is locked" } };
      }
      return { status: 200, body: { ok: true } };
    }
    return { status: 404, body: { message: "Not Found" } };
  });

  try {
    await addAccounts(server.url, { token: "t", ids: [1, 2, 3] });
    assert.equal(attempts, 2);
  } finally {
    await server.close();
  }
});

test("addAccounts sends space-joined ids with the expiry and a bearer token", async () => {
  const server = await startServer((req) => {
    if (req.url === "/api/manager/members/subscription") {
      return { status: 200, body: {} };
    }
    return { status: 404, body: { message: "Not Found" } };
  });

  try {
    await addAccounts(server.url, {
      token: "the-token",
      ids: [6627962056, 7816448749, 6833210964],
      date: "2030-12-31T23:59:59Z",
    });

    const request = server.seen[0];
    assert.equal(request.url, "/api/manager/members/subscription");
    assert.equal(request.authorization, "Bearer the-token");
    assert.deepEqual(request.body, {
      id: "6627962056 7816448749 6833210964",
      date: "2030-12-31T23:59:59Z",
    });
  } finally {
    await server.close();
  }
});

test("addAccounts refuses to send without a token", async () => {
  await assert.rejects(
    addAccounts("http://127.0.0.1:1", { token: "", ids: [1] }),
    /token/i,
  );
});

/* ── members ────────────────────────────────────────────────────────────── */

test("members returns the parsed member list", async () => {
  const server = await startServer((req) => {
    if (req.url === "/api/manager/members") {
      return {
        body: [
          { id: 1, subscriptions: [{ active: true, endsAt: "2030-12-31" }] },
          { id: 2, subscriptions: [] },
        ],
      };
    }
    return { status: 404, body: { message: "Not Found" } };
  });

  try {
    const rows = await members(server.url, { token: "the-token" });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, 1);
    assert.equal(server.seen[0].authorization, "Bearer the-token");
  } finally {
    await server.close();
  }
});

/* ── farmerSession ──────────────────────────────────────────────────────── */

test("farmerSession authenticates with initData on the farmer route", async () => {
  const server = await startServer((req) => {
    if (req.url === "/api/session") {
      return { body: { session: "0123456789abcdef" } };
    }
    return { status: 404, body: { message: "Not Found" } };
  });

  try {
    const result = await farmerSession(server.url, { initData: "user=%7B..." });
    assert.equal(result.session, "0123456789abcdef");
    assert.deepEqual(server.seen[0].body, { auth: "user=%7B..." });
    assert.equal(server.seen[0].authorization, null);
  } finally {
    await server.close();
  }
});

/* ── session store ──────────────────────────────────────────────────────── */

/* ── telegram login flow ───────────────────────────────────────────────── */

test("telegramLoginStart posts the phone number and returns the session id", async () => {
  const server = await startServer((req) => {
    if (req.url === "/api/telegram/login") {
      return { body: { session: "0123456789abcdef", type: "code" } };
    }
    return { status: 404, body: { message: "Not Found" } };
  });

  try {
    const result = await telegramLoginStart(server.url, "+15551234567");
    assert.equal(result.session, "0123456789abcdef");
    assert.deepEqual(server.seen[0].body, { phone: "+15551234567" });
    assert.equal(server.seen[0].url, "/api/telegram/login");
  } finally {
    await server.close();
  }
});

test("telegramLoginCode posts the session and code together", async () => {
  const server = await startServer((req) => {
    if (req.url === "/api/telegram/code") {
      return { body: { session: "0123456789abcdef", user: { id: 1 } } };
    }
    return { status: 404, body: { message: "Not Found" } };
  });

  try {
    const result = await telegramLoginCode(server.url, {
      session: "0123456789abcdef",
      code: "12345",
    });
    assert.equal(result.user.id, 1);
    assert.deepEqual(server.seen[0].body, {
      session: "0123456789abcdef",
      code: "12345",
    });
  } finally {
    await server.close();
  }
});

test("telegramLoginPassword submits the 2FA password", async () => {
  const server = await startServer((req) => {
    if (req.url === "/api/telegram/password") {
      return { body: { session: "0123456789abcdef", user: { id: 1 } } };
    }
    return { status: 404, body: { message: "Not Found" } };
  });

  try {
    await telegramLoginPassword(server.url, {
      session: "0123456789abcdef",
      password: "2473",
    });
    assert.deepEqual(server.seen[0].body, {
      session: "0123456789abcdef",
      password: "2473",
    });
  } finally {
    await server.close();
  }
});

test("telegram login surfaces the missing-subscription refusal", async () => {
  const server = await startServer(() => ({
    status: 403,
    body: { message: "Not allowed!" },
  }));

  try {
    await assert.rejects(
      telegramLoginCode(server.url, { session: "0123456789abcdef", code: "1" }),
      /Not allowed!/,
    );
  } finally {
    await server.close();
  }
});

/* ── account loading ────────────────────────────────────────────────────── */

/** Encode a Telegram initData string the way THE-NILE stores it. */
function makeInitData(id) {
  const user = encodeURIComponent(JSON.stringify({ id, first_name: "Leo" }));
  return `user=${user}&auth_date=1790584295&signature=abc&hash=def`;
}

test("accountsFromConfig yields 1-based accounts with telegram ids", () => {
  const config = JSON.stringify({
    "app-store": JSON.stringify({
      state: {
        accounts: [
          { title: "Account 1", telegramInitData: makeInitData(6627962056) },
          { title: "Account 2", telegramInitData: makeInitData(7816448749) },
        ],
      },
    }),
  });

  const rows = accountsFromConfig(config);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    index: 1,
    title: "Account 1",
    id: 6627962056,
    initData: makeInitData(6627962056),
  });
  assert.equal(rows[1].index, 2);
});

test("accountsFromConfig skips accounts whose initData carries no user", () => {
  const config = JSON.stringify({
    "app-store": JSON.stringify({
      state: {
        accounts: [
          { title: "Account 1", telegramInitData: "auth_date=1&hash=x" },
          { title: "Account 2", telegramInitData: makeInitData(7440604043) },
        ],
      },
    }),
  });

  const rows = accountsFromConfig(config);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Account 2");
});

test("accountsFromConfig reports a config that holds no accounts", () => {
  assert.throws(() => accountsFromConfig(JSON.stringify({})), /accounts/);
});

test("partitionsFromConfig keeps 1-based indices aligned with the stored array", () => {  const config = JSON.stringify({
    "app-store": JSON.stringify({
      state: {
        accounts: [
          { title: "no init data", telegramInitData: "auth_date=1&hash=x" },
          { title: "Account 2", partition: "persist:abc-123", telegramInitData: "x" },
        ],
      },
    }),
  });

  /* Account 1 has no usable initData, so accountsFromConfig skips it — but
   * account 2 must still be index 2, or `session 2` would mint the wrong one. */
  assert.deepEqual(partitionsFromConfig(config), [
    { index: 1, partition: null },
    { index: 2, partition: "persist:abc-123" },
  ]);
});

/* ── CLI argument parsing ───────────────────────────────────────────────── */

test("parseCliArgs reads command, range and flags", () => {
  const parsed = parseCliArgs([
    "add",
    "1-139",
    "--server",
    "http://3.238.238.69",
    "--date",
    "2030-12-31",
    "--phones",
    "phones.csv",
  ]);
  assert.equal(parsed.command, "add");
  assert.equal(parsed.range, "1-139");
  assert.equal(parsed.server, "http://3.238.238.69");
  assert.equal(parsed.date, "2030-12-31");
  assert.equal(parsed.phones, "phones.csv");
});

test("parseCliArgs defaults the range to 'all' when omitted", () => {
  const parsed = parseCliArgs(["status"]);
  assert.equal(parsed.command, "status");
  assert.equal(parsed.range, "all");
});

test("parseCliArgs rejects an unknown flag rather than ignoring it", () => {
  assert.throws(() => parseCliArgs(["add", "--nope"]), /--nope/);
});

test("parseCliArgs accepts the quick sign-in flags", () => {
  const parsed = parseCliArgs(["session", "1-5", "--quick", "--code-timeout", "30"]);
  assert.equal(parsed.command, "session");
  assert.equal(parsed.range, "1-5");
  assert.equal(parsed.quick, true);
  assert.equal(parsed.codeTimeout, "30");
});

test("parseCliArgs treats the farmer, not the range, as wallets' first positional", () => {
  const parsed = parseCliArgs([
    "wallets",
    "lootvault",
    "12-19",
    "--ssh",
    "ubuntu@1.2.3.4",
    "--key",
    "C:\\keys\\srv.pem",
    "--pool",
    "2",
    "--dry-run",
  ]);

  assert.equal(parsed.command, "wallets");
  assert.equal(parsed.positionals[1], "lootvault");
  assert.equal(parsed.range, "12-19");
  assert.equal(parsed.ssh, "ubuntu@1.2.3.4");
  assert.equal(parsed.key, "C:\\keys\\srv.pem");
  assert.equal(parsed.pool, "2");
  assert.equal(parsed.dryRun, true);
});

test("parseCliArgs defaults a wallets range to all", () => {
  const parsed = parseCliArgs(["wallets", "tonoreum"]);

  assert.equal(parsed.command, "wallets");
  assert.equal(parsed.range, "all");
});

test("parseCliArgs reads the wallets safety flags", () => {
  const parsed = parseCliArgs(["wallets", "mrg", "7", "--vault", "v.json", "--verify-only"]);

  assert.equal(parsed.vault, "v.json");
  assert.equal(parsed.verifyOnly, true);
});

test("parseCliArgs accepts --sign for bots that bind with a signed proof", () => {
  const parsed = parseCliArgs(["wallets", "mrg", "20", "--sign"]);

  assert.equal(parsed.sign, true);
  assert.equal(parsed.range, "20");
});

/* ── session store ───────────────────────────────────────────────────── */

test("session store round-trips a login outside the repo tree", () => {
  const dir = mkdtempSync(join(tmpdir(), "grace-"));
  try {
    const session = {
      server: "http://3.238.238.69",
      token: "jwt-token-value",
      user: { id: 1, username: "admin" },
      obtainedAt: "2026-09-29T00:00:00.000Z",
    };

    writeSession(dir, session);
    const path = sessionFilePath(dir);
    assert.ok(existsSync(path), "session file should be written");

    const loaded = readSession(dir);
    assert.deepEqual(loaded, session);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readSession returns null for a missing file rather than throwing", () => {
  const dir = join(tmpdir(), "grace-does-not-exist");
  assert.equal(readSession(dir), null);
});

test("writeSession creates the directory when it does not exist", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "grace-parent-")), "nested", "grace");
  try {
    writeSession(dir, { token: "t" });
    assert.ok(existsSync(sessionFilePath(dir)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("defaultGraceDir honours GRACE_HOME so agents can redirect storage", () => {
  const previous = process.env.GRACE_HOME;
  try {
    process.env.GRACE_HOME = "C:\\custom\\grace";
    assert.equal(defaultGraceDir(), "C:\\custom\\grace");
  } finally {
    if (previous === undefined) delete process.env.GRACE_HOME;
    else process.env.GRACE_HOME = previous;
  }
});

test("defaultGraceDir lands outside the repository by default", () => {  const previous = process.env.GRACE_HOME;
  try {
    delete process.env.GRACE_HOME;
    const dir = defaultGraceDir();
    assert.ok(!dir.includes("THE-NILE"), `unexpected in-repo path: ${dir}`);
    assert.ok(dir.includes("the-nile"), `unexpected path: ${dir}`);
  } finally {
    if (previous !== undefined) process.env.GRACE_HOME = previous;
  }
});

test(
  "session file is written with owner-only permissions",
  {
    skip:
      process.platform === "win32"
        ? "Windows does not enforce POSIX modes, so there is nothing to assert"
        : false,
  },
  () => {
    const dir = mkdtempSync(join(tmpdir(), "grace-perm-"));
    try {
      writeSession(dir, { token: "secret" });
      const mode = statSync(sessionFilePath(dir)).mode & 0o777;
      assert.equal(
        mode & 0o077,
        0,
        `expected no group/other access, got ${mode.toString(8)}`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

/* ── registration prerequisite ─────────────────────────────────────────── *
 *
 * `/api/telegram/code` answers 403 "Not allowed!" unless the account already
 * has an active subscription, so a session run has to add the accounts first.
 */

/** Rows shaped like `GET /api/manager/members`. */
const membersFixture = (rows) => rows;

test("accountsNeedingRegistration finds accounts the server has never seen", () => {
  const picked = [{ index: 1, id: 111 }, { index: 2, id: 222 }];
  const rows = membersFixture([
    { id: 111, subscriptions: [{ id: 1 }] },
  ]);

  assert.deepEqual(accountsNeedingRegistration(picked, rows), [
    { index: 2, id: 222 },
  ]);
});

test("accountsNeedingRegistration finds members that have no subscription", () => {
  const picked = [{ index: 3, id: 333 }];
  const rows = membersFixture([{ id: 333, subscriptions: [] }]);

  assert.deepEqual(accountsNeedingRegistration(picked, rows), picked);
});

test("accountsNeedingRegistration skips accounts that are already subscribed", () => {
  const picked = [{ index: 1, id: 111 }];
  const rows = membersFixture([{ id: 111, subscriptions: [{ id: 1 }] }]);

  assert.deepEqual(accountsNeedingRegistration(picked, rows), []);
});

test("accountsNeedingRegistration matches ids whether the API sends numbers or strings", () => {
  const picked = [{ index: 1, id: 111 }];
  const rows = membersFixture([{ id: "111", subscriptions: [{ id: 1 }] }]);

  assert.deepEqual(accountsNeedingRegistration(picked, rows), []);
});

/* ── CLI entry point ──────────────────────────────────────────────────── *
 *
 * Nothing else imports scripts/grace.mjs, so without these a syntax error or a
 * broken flag parser would only surface when a human ran the command.
 */

const cliPath = fileURLToPath(new URL("../scripts/grace.mjs", import.meta.url));

/**
 * Environment for a spawned CLI.
 *
 * `NODE_TEST_CONTEXT` must not be inherited: a `node` child that sees it expects
 * to be a test-runner worker and waits forever for a channel the parent will
 * never open, so `execFileSync` hangs instead of failing.
 */
function cliEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_OPTIONS;
  return env;
}

/**
 * Run the CLI without blocking this process's event loop.
 *
 * `execFileSync` would deadlock any test whose fake server lives in this
 * process: the parent cannot answer the child's HTTP request while it is parked
 * in a synchronous wait, so the child hangs until it is killed.
 */
function runCli(args, env = {}, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: cliEnv(env),
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

test("the CLI starts and prints its usage", () => {
  const output = execFileSync(process.execPath, [cliPath], {
    encoding: "utf8",
    env: cliEnv(),
  });
  assert.match(output, /Usage:/);
  assert.match(output, /grace session <range> --quick/);
});

test("grace session --quick adds missing accounts on the server before minting", async () => {
  const root = mkdtempSync(join(tmpdir(), "grace-cli-"));
  const graceDir = join(root, "grace");
  const nileDir = join(root, "nile");
  const telegramId = 6627962056;
  const configPath = join(nileDir, "config.json");

  mkdirSync(nileDir, { recursive: true });
  writeFileSync(
    configPath,
    JSON.stringify({
      "app-store": JSON.stringify({
        state: {
          accounts: [
            {
              title: "Account 1",
              partition: "persist:missing-partition",
              telegramInitData: makeInitData(telegramId),
            },
          ],
        },
      }),
    }),
  );

  writeSession(graceDir, {
    server: "http://placeholder",
    token: "manager-jwt",
    user: { id: 1 },
  });

  const server = await startServer((req) => {
    if (req.url === "/api/manager/members") return { body: [] };
    if (req.url === "/api/manager/members/subscription") {
      return { body: { ok: true } };
    }
    return { status: 404, body: { message: "unexpected route" } };
  });

  try {
    const run = await runCli(
      ["session", "1", "--quick", "--server", server.url, "--json"],
      { GRACE_HOME: graceDir, GRACE_NILE_CONFIG: configPath },
    );

    /* The account has no usable local session, so minting stops right after the
     * registration step — which is the part this test is about. */
    const parsed = JSON.parse(run.stdout);
    assert.equal(parsed.results[0].ok, false);
    assert.match(parsed.results[0].reason, /no local Telegram session/);

    const added = server.seen.find(
      (entry) => entry.url === "/api/manager/members/subscription",
    );
    assert.ok(added, "the account should have been added before minting");
    assert.equal(added.method, "POST");
    assert.match(String(added.body.id), new RegExp(String(telegramId)));
  } finally {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("the CLI reports an unknown flag on stderr and exits non-zero", () => {  assert.throws(
    () => execFileSync(process.execPath, [cliPath, "add", "--nope"], {
      encoding: "utf8",
      stdio: "pipe",
      env: cliEnv(),
    }),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(String(error.stderr), /--nope/);
      return true;
    },
  );
});

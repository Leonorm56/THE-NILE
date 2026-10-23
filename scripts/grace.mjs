#!/usr/bin/env node
/**
 * GRACE — CLI for AI agents to manage THE-NILE's cloud accounts.
 *
 * Commands
 *   server [URL]                show or save the cloud address (no built-in default)
 *   addresses                   what cloud address each account's mini-app is set to
 *   login                       authenticate to the Cloud Manager and store the session
 *   show                        print the stored address and session (token masked)
 *   add <range>                 register accounts on the cloud and give them a subscription
 *   point <range>               set each account's mini-app cloud address
 *   status [range]              read-only view of members and their cloud sessions
 *   session <range>             walk accounts through Telegram login to mint their cloud session
 *   session <range> --quick     mint them headlessly with Quick Sign-In (no codes typed)
 *
 * Range syntax: `all`, `5`, `1-139`, `3-5,8`.
 *
 * Credentials come from `--email/--password`, then `GRACE_EMAIL`/`GRACE_PASSWORD`,
 * then an interactive prompt — never from the account data on disk.
 *
 * The cloud address is never assumed: `--server`, then `GRACE_SERVER`, then the
 * saved address, then the server of the stored login.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import net from "node:net";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  accountsFromConfig,
  accountsNeedingRegistration,
  addAccounts,
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
  configFilePath,
  normalizePasswords,
  passwordsForServer,
  readConfig,
  resolveServer as resolveCloudServer,
  saveServer,
} from "../src/main/libs/graceConfig.mjs";
import {
  defaultGraceDir,
  readSession,
  sessionFilePath,
  writeSession,
} from "../src/main/libs/graceSession.mjs";
import { readStoredValue } from "../src/main/libs/chromeStorage.mjs";
import { writeStoredValue } from "../src/main/libs/chromeStorageWrite.mjs";
import { bakedCloudServer, repointExtension } from "../src/main/libs/extensionCloud.mjs";
import { accountProxy, checkProxy } from "../src/main/libs/proxyCheck.mjs";
import {
  accountsMissingSession,
  isTransientMintError,
} from "../src/main/libs/provision.mjs";
import {
  mintCloudSession,
  openTelegramClient,
} from "../src/main/libs/quickSignIn.mjs";
import { vaultWalletMap, walletPlan } from "../src/main/libs/walletMap.mjs";
import { openVault, walletContractVersion } from "../src/main/libs/nileVault.mjs";
import { runScp, runSsh } from "../src/main/libs/sshExec.mjs";

const DEFAULT_DATE = "2030-12-31T23:59:59Z";

/** Key the mini-app writes an account's local Telegram session under. */
const LOCAL_SESSION_KEY = "account-default:local-telegram-session";

/** Key the mini-app writes its settings (including cloudServer) under. */
const SETTINGS_KEY = "account-default:settings";

/** Gap between accounts in a quick run; Telegram rate-limits logins. */
const QUICK_ACCOUNT_DELAY_MS = 2500;

const USAGE = `GRACE — cloud account manager for THE-NILE

Usage:
  grace server [URL]                    show or save the cloud address
  grace server <URL> --passwords a,b     save the address and its 2FA candidates
  grace addresses                       cloud address each account is set to
  grace login [--server URL] [--email E] [--password P]
  grace show
  grace add <range> [--server URL] [--date ISO]
  grace point <range> [--server URL]    set each account's mini-app address
  grace extension [URL] [--dry-run]     point the installed extension's default
  grace proxies [range]                 test the proxy stored on each account
  grace doctor                          check the setup for the common failures
  grace status [range] [--server URL]
  grace session <range> [--server URL] [--phones FILE] [--passwords a,b]
  grace session <range> --quick [--passwords a,b] [--code-timeout SECONDS]
  grace provision [range] [--server URL]   add + point + extension + mint, then verify
                                           (safe to re-run; --remint redoes minted ones)
  grace wallets <farmer> [range] --ssh user@host --key KEY
                                        bind each account's NileVault wallet through
                                        that bot's own flow (--dry-run, --pool N,
                                        --verify-only, --vault FILE, --sign)

Range:  all | 5 | 1-139 | 3-5,8
Env:    GRACE_SERVER, GRACE_EMAIL, GRACE_PASSWORD, GRACE_HOME, GRACE_NILE_CONFIG,
        GRACE_SSH_HOST, GRACE_SSH_KEY, GRACE_VAULT, GRACE_VAULT_PASSWORD

\`wallets\` reads NileVault's \`ACCOUNT n\` wallets and binds them on the farm
server over SSH. The SSH host and key are per-run arguments on purpose: these
machines get rebuilt, so a saved value would silently point at a stale host.

\`--sign\` unlocks NileVault (hidden prompt, or GRACE_VAULT_PASSWORD) for bots
that bind with a signed proof (MRG). The phrase goes to the server on stdin only,
never into the plan, the arguments or the log.

There is no default cloud address: set one with \`grace server <url>\`, because
the host changes and a stale default fails in ways that look like an outage.

Each saved address remembers its own 2FA candidates (default 2473 then 7007),
so a run needs no password flag at all.

A cloud session is only minted for an account the server already knows: /code
refuses with 403 "Not allowed!" otherwise. So \`session\` adds any missing
accounts first, which needs a manager session (\`grace login\`), then points each
account's mini-app at the same address, then mints. Close THE-NILE before a run:
the address is written into the app's own storage.
`;

/** THE-NILE's per-user data directory, which holds config.json and partitions. */
function nileDataDir() {
  if (process.env.GRACE_NILE_CONFIG) {
    return join(process.env.GRACE_NILE_CONFIG, "..");
  }
  const appData = process.env.APPDATA;
  if (!appData) throw new Error("APPDATA is not set; pass GRACE_NILE_CONFIG");
  return join(appData, "the-nile");
}

/** Where THE-NILE keeps its config.json (independent of GRACE_HOME). */
function nileConfigPath() {
  if (process.env.GRACE_NILE_CONFIG) return process.env.GRACE_NILE_CONFIG;
  return join(nileDataDir(), "config.json");
}

/** Load THE-NILE's config.json as raw text. */
function loadNileConfigText() {
  const path = nileConfigPath();
  if (!existsSync(path)) {
    throw new Error(`THE-NILE config not found at ${path}`);
  }
  return readFileSync(path, "utf8");
}

/** Load every account THE-NILE knows about. */
function loadAccounts() {
  return accountsFromConfig(loadNileConfigText());
}

/**
 * Map account index → its Chromium partition directory.
 *
 * THE-NILE stores accounts as `persist:<uuid>` and Chromium puts that
 * partition's storage under `Partitions/<uuid>`.
 */
function partitionDirs() {
  const dirs = new Map();

  for (const row of partitionsFromConfig(loadNileConfigText())) {
    if (!row.partition) continue;
    const name = String(row.partition).replace(/^persist:/, "");
    /* Never let a config value escape the data directory. */
    if (!name || name.includes("..") || /[\\/]/.test(name)) continue;
    dirs.set(row.index, join(nileDataDir(), "Partitions", name));
  }

  return dirs;
}

/** Resolve a range against the loaded accounts, reporting any that are absent. */
function selectAccounts(rows, spec) {
  const total = rows.length ? Math.max(...rows.map((row) => row.index)) : 0;
  const indices = parseRange(spec, total);
  const byIndex = new Map(rows.map((row) => [row.index, row]));
  return {
    total,
    indices,
    picked: indices.map((index) => byIndex.get(index)).filter(Boolean),
    missing: indices.filter((index) => !byIndex.has(index)),
  };
}

/** The stored Cloud Manager session, if any. */
function storedSession() {
  return readSession(defaultGraceDir());
}

/**
 * Resolve the cloud address for a command.
 *
 * @param {{server: string|null}} args
 * @returns {string}
 */
function resolveServer(args) {
  return resolveCloudServer({
    flag: args.server,
    config: readConfig(defaultGraceDir()),
    session: storedSession(),
  });
}

/** Say which source the effective address came from, for `grace server`. */
function serverSource(args) {
  if (args.server) return "--server";
  if (process.env.GRACE_SERVER) return "GRACE_SERVER";
  if (readConfig(defaultGraceDir()).server) return "saved (grace server)";
  if (storedSession()?.server) return "stored login";
  return "none";
}

/**
 * The 2FA candidates to try for this run.
 *
 * Explicit flags win; otherwise use the pair saved with the address, because
 * those values belong to that server's accounts and change when the server does.
 *
 * @param {{passwords: string|null, password: string|null}} args
 * @param {string} server
 * @returns {string[]}
 */
function twoFactorCandidates(args, server) {
  const explicit = normalizePasswords(
    args.passwords || args.password || process.env.GRACE_PASSWORD,
  );
  if (explicit.length > 0) return explicit;

  return passwordsForServer(readConfig(defaultGraceDir()), server);
}

/** Read a value from flags, then the environment, then an interactive prompt. */
async function resolveValue({ flag, env, label, interactive }) {
  if (flag) return flag;
  if (process.env[env]) return process.env[env];
  if (!interactive) return null;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(label)).trim();
  } finally {
    rl.close();
  }
}

function out(args, human, data) {
  if (args.json) process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  else process.stdout.write(`${human}\n`);
}

/**
 * Per-account progress line.
 *
 * Suppressed under `--json` so the command emits exactly one document an agent
 * can parse, rather than a stream of objects.
 */
function progress(args, human) {
  if (!args.json) process.stdout.write(`${human}\n`);
}

/**
 * Leave once the last line is on the pipe.
 *
 * gramjs can keep a reconnect timer alive after the final account, which holds
 * the process open long after its work is done — the run looks finished, but a
 * batch loop waiting on it never spawns the next range. Every session is stored
 * on the server by this point, so exiting cannot lose one.
 */
function exitWhenFlushed() {
  if (process.env.NODE_TEST_CONTEXT) return;

  const done = () => process.exit(process.exitCode ?? 0);
  process.stdout.write("", done);
  setTimeout(done, 2000).unref();
}

function requireSession() {
  const dir = defaultGraceDir();
  const session = readSession(dir);
  if (!session?.token) {
    throw new Error(
      `No cloud session stored. Run \`grace login\` first (looked in ${sessionFilePath(dir)})`,
    );
  }
  return session;
}

function mask(token) {
  return `${token.slice(0, 12)}…${token.slice(-6)}`;
}

/** Sleep, so a loop of logins does not trip Telegram's rate limits. */
function delay(ms) {
  /* Deliberately not unref'd: between accounts there may be no open socket
   * left, and an unref'd timer would let the process exit and silently skip
   * the rest of the range. */
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ── commands ─────────────────────────────────────────────────────────── */

/** The runner GRACE ships to the farm server on every `wallets` run. */
const WALLET_RUNNER_PATH = fileURLToPath(
  new URL("../src/main/libs/walletRunner.mjs", import.meta.url),
);

/** Where NileVault keeps its vault. GRACE only reads it. */
function vaultFilePath(args) {
  if (args.vault) return args.vault;
  if (process.env.GRACE_VAULT) return process.env.GRACE_VAULT;

  const appData = process.env.APPDATA;
  if (!appData) throw new Error("APPDATA is not set; pass --vault path/to/vault.json");
  return join(appData, "nile-vault", "vault.json");
}

/**
 * Bind each account's NileVault wallet on the farm server.
 *
 * The wallet list never leaves this machine as anything but a plan, and the
 * write happens server-side where the sessions and proxies live. SSH details
 * are per-run because the host changes; nothing here is saved.
 */
async function cmdWallets(args) {
  const farmer = args.positionals?.[1] ?? null;
  if (!farmer) {
    throw new Error(
      "grace wallets needs a farmer id — e.g. grace wallets lootvault 2-187\n\n" + USAGE,
    );
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(farmer)) {
    throw new Error(`invalid farmer id "${farmer}"`);
  }

  const host = args.ssh || process.env.GRACE_SSH_HOST;
  const key = args.key || process.env.GRACE_SSH_KEY;
  if (!host) {
    throw new Error("pass --ssh user@host (or set GRACE_SSH_HOST) — GRACE never stores it");
  }
  if (!key) {
    throw new Error("pass --key path/to/key.pem (or set GRACE_SSH_KEY)");
  }

  const vaultPath = vaultFilePath(args);
  if (!existsSync(vaultPath)) {
    throw new Error(`NileVault vault not found at ${vaultPath}`);
  }

  let vault;
  try {
    vault = JSON.parse(readFileSync(vaultPath, "utf8"));
  } catch (error) {
    throw new Error(`could not read ${vaultPath}: ${error.message}`);
  }

  const wallets = vaultWalletMap(vault);
  if (wallets.size === 0) {
    throw new Error(`no "ACCOUNT n" wallets in ${vaultPath} — is that the right vault?`);
  }

  const selection = selectAccounts(loadAccounts(), args.range);
  const plan = walletPlan(selection.picked, wallets);

  out(
    args,
    `farmer ${farmer}: ${selection.indices.length} account(s) in ${args.range}, ` +
      `${plan.rows.length} with a NileVault wallet`,
    {
      farmer,
      range: args.range,
      accounts: selection.indices,
      planned: plan.rows.map((row) => ({
        position: row.position,
        telegramId: row.telegramId,
        address: row.address,
      })),
      missing: plan.missing,
    },
  );

  if (plan.missing.length > 0) {
    progress(
      args,
      `no NileVault wallet: ${plan.missing.map((row) => row.position).join(", ")}`,
    );
  }

  if (plan.rows.length === 0) {
    throw new Error("no account in range has a NileVault wallet — nothing to do");
  }

  const pool = args.pool === null ? 1 : Number(args.pool);
  if (!Number.isInteger(pool) || pool < 1) {
    throw new Error("--pool must be a positive integer");
  }

  /* Bots that bind by signed proof (MRG) need the wallet phrase. It is
   * decrypted here, in memory, and piped to the runner on stdin — never into
   * the plan file, the arguments or the log. */
  let secrets = null;
  if (args.sign) {
    const password =
      process.env.GRACE_VAULT_PASSWORD || (await promptHidden("NileVault password: "));
    const opened = openVault(vault, password);

    secrets = {};
    for (const row of plan.rows) {
      const wallet = wallets.get(row.position);
      const version = walletContractVersion(wallet.platform);
      if (!version) {
        throw new Error(
          `position ${row.position}: wallet platform "${wallet.platform}" is not one the bot can sign for`,
        );
      }

      secrets[row.telegramId] = {
        phrase: opened.phraseFor(wallet.id),
        version,
      };
    }

    progress(args, `unlocked NileVault — ${Object.keys(secrets).length} signing key(s)`);
  }

  progress(
    args,
    `${args.dryRun ? "dry run — nothing will be written" : "binding wallets"} · pool ${pool}`,
  );

  const dir = mkdtempSync(join(tmpdir(), `grace-wallets-${farmer}-`));
  const localPlan = join(dir, "plan.json");
  writeFileSync(localPlan, JSON.stringify(plan.rows, null, 2));

  const remoteDir = "NileChain/apps/nilecloud";
  const remotePlan = `${remoteDir}/tmp-wallets-${farmer}.json`;

  try {
    /* The plan first, then the runner: if the runner upload fails the server
     * never sees a plan it cannot execute. */
    await runScp({ key, local: localPlan, remote: `${host}:${remotePlan}` });
    await runScp({
      key,
      local: WALLET_RUNNER_PATH,
      remote: `${host}:${remoteDir}/tmp-wallet-runner.mjs`,
    });

    const flags = [
      `--farmer=${farmer}`,
      `--plan=tmp-wallets-${farmer}.json`,
      `--pool=${pool}`,
      `--log=/tmp/wallets-${farmer}.log`,
    ];
    if (args.dryRun) flags.push("--dry");
    if (args.verifyOnly) flags.push("--verify-only");
    if (secrets) flags.push("--secrets=stdin");

    /* `ssh host cmd` skips the profile, so nvm's node is not on PATH. */
    const command =
      `. ~/.nvm/nvm.sh >/dev/null 2>&1; cd ~/${remoteDir} && ` +
      `node tmp-wallet-runner.mjs ${flags.join(" ")}`;

    const code = await runSsh({
      host,
      key,
      command,
      input: secrets ? JSON.stringify(secrets) : undefined,
    });
    if (code !== 0) process.exitCode = code;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function cmdServer(args) {
  const dir = defaultGraceDir();
  /* `server <url>` lands in the second positional, which the arg parser calls
   * `range`; "all" means it was omitted. */
  const value = args.range && args.range !== "all" ? args.range : null;

  if (!value) {
    const server = resolveServer(args);
    out(
      args,
      `server  ${server}\n` +
        `source  ${serverSource(args)}\n` +
        `file    ${configFilePath(dir)}`,
      { server, source: serverSource(args), file: configFilePath(dir) },
    );
    return;
  }

  const saved = saveServer(dir, value, { passwords: args.passwords });
  const stored = saved.servers?.[saved.server]?.passwords ?? [];

  out(
    args,
    `✓ Cloud address saved: ${saved.server}\n` +
      `  2FA candidates ${stored.length} stored for this address\n` +
      `  file ${configFilePath(dir)}`,
    {
      ok: true,
      server: saved.server,
      passwordCandidates: stored.length,
      file: configFilePath(dir),
    },
  );
}

/**
 * Refuse to touch account storage while THE-NILE has it open.
 *
 * Chromium keeps each partition's LevelDB mapped, and its in-memory sequence
 * number is authoritative. An append made underneath a running instance can be
 * overwritten at its next compaction, so "app closed" is the one precondition
 * that makes this write safe — and it is cheap to check.
 */
function assertAppClosed() {
  let running = false;

  try {
    if (process.platform === "win32") {
      const output = execFileSync("tasklist", [], {
        encoding: "utf8",
        windowsHide: true,
      });
      running = /the-nile\.exe/i.test(output);
    } else {
      const output = execFileSync("pgrep", ["-f", "the-nile"], {
        encoding: "utf8",
      });
      running = output.trim().length > 0;
    }
  } catch {
    /* No tasklist/pgrep available: let the write fail on its own terms. */
    running = false;
  }

  if (running) {
    throw new Error(
      "Close THE-NILE first: it holds each account's chrome.storage open, so a " +
        "write made underneath it can be lost",
    );
  }
}

/**
 * Point accounts' mini-app at one cloud address.
 *
 * Only `cloudServer` changes — every other stored setting is preserved — and an
 * account already on that address is left untouched, so repeating a run costs no
 * writes.
 *
 * @returns {{index: number, ok: boolean, changed?: boolean, from?: string|null, reason?: string}[]}
 */
function pointAccounts(picked, server) {
  const dirs = partitionDirs();
  const results = [];

  for (const account of picked) {
    const partitionDir = dirs.get(account.index);

    if (!partitionDir) {
      results.push({
        index: account.index,
        ok: false,
        reason: "account has no partition in config.json",
      });
      continue;
    }

    const current = readStoredValue(partitionDir, SETTINGS_KEY);
    const base = current && typeof current === "object" ? current : null;

    if (!base) {
      results.push({
        index: account.index,
        ok: false,
        reason: "no mini-app settings stored (open the account once)",
      });
      continue;
    }

    if (base.cloudServer === server) {
      results.push({ index: account.index, ok: true, changed: false, from: base.cloudServer });
      continue;
    }

    try {
      writeStoredValue(partitionDir, SETTINGS_KEY, { ...base, cloudServer: server });
      results.push({
        index: account.index,
        ok: true,
        changed: true,
        from: base.cloudServer ?? null,
      });
    } catch (error) {
      results.push({ index: account.index, ok: false, reason: error.message });
    }
  }

  return results;
}

/** One-line summary of a pointing pass. */
function summarizePointing(results, server) {
  const changed = results.filter((row) => row.ok && row.changed).length;
  const already = results.filter((row) => row.ok && !row.changed).length;
  const failed = results.filter((row) => !row.ok).length;

  return (
    `  address    ${server}\n` +
    `  changed    ${changed}\n` +
    `  already    ${already}` +
    (failed ? `\n  failed     ${failed}` : "")
  );
}

/** `grace point <range>` — set the mini-app's cloud address on disk. */async function cmdPoint(args) {
  const server = resolveServer(args);
  const accounts = loadAccounts();
  const { picked, missing } = selectAccounts(accounts, args.range || "all");
  if (picked.length === 0) throw new Error("No matching accounts to point");

  assertAppClosed();

  const results = pointAccounts(picked, server);
  const failed = results.filter((row) => !row.ok);

  out(
    args,
    `✓ Pointed accounts at ${server}\n${summarizePointing(results, server)}` +
      (missing.length ? `\n  absent     ${missing.length} range entries not in THE-NILE` : ""),
    { server, results, missing },
  );

  if (failed.length > 0) process.exitCode = 1;
}

/** Where THE-NILE keeps the extension it loads on every partition. */
function extensionDir() {
  if (process.env.GRACE_EXTENSION) return process.env.GRACE_EXTENSION;
  return join(nileDataDir(), "Extension");
}

/** The raw account records, which carry the proxy fields. */
function loadRawAccounts() {
  const store = JSON.parse(JSON.parse(loadNileConfigText())["app-store"]);
  return Array.isArray(store?.state?.accounts) ? store.state.accounts : [];
}

/** `grace extension [url]` — repoint the bundle's baked default. */
async function cmdExtension(args) {
  const dir = extensionDir();
  const current = bakedCloudServer(dir);

  const url =
    args.server || process.env.GRACE_SERVER || readConfig(defaultGraceDir()).server || null;

  if (!url) {
    out(
      args,
      `✓ Extension default cloud address: ${current ?? "(none found)"}\n  ${dir}`,
      { ok: true, dir, cloudServer: current },
    );
    return;
  }

  const result = repointExtension(dir, url, { dryRun: args.dryRun });

  if (args.dryRun) {
    out(
      args,
      `would repoint ${result.files} file(s): ${result.from} → ${result.to}`,
      { ok: true, dryRun: true, ...result },
    );
    return;
  }

  out(
    args,
    result.files === 0
      ? `✓ Extension already points at ${result.to}`
      : `✓ Extension repointed: ${result.from} → ${result.to}\n` +
          `  files      ${result.files} (${result.replacements} literals)\n` +
          `  backup     ${result.backup}`,
    { ok: true, dryRun: false, ...result },
  );
}

/** `grace proxies [range]` — test the proxy stored on each account. */
async function cmdProxies(args) {
  const accounts = loadAccounts();
  const raw = loadRawAccounts();
  const { picked, missing } = selectAccounts(accounts, args.range || "all");

  const rows = [];
  const queue = picked.map((account) => ({
    account,
    proxy: accountProxy(raw[account.index - 1] ?? {}),
  }));

  /* Six at a time: enough to finish 187 accounts in under a minute, few enough
   * that a dead proxy host cannot stall the whole run. */
  const worker = async () => {
    for (;;) {
      const item = queue.shift();
      if (!item) return;

      if (!item.proxy) {
        rows.push({
          index: item.account.index,
          title: item.account.title,
          proxy: null,
          ok: false,
          status: null,
          detail: "no proxy enabled",
        });
        continue;
      }

      const check = await checkProxy(item.proxy);
      rows.push({
        index: item.account.index,
        title: item.account.title,
        proxy: `${item.proxy.host}:${item.proxy.port}`,
        ...check,
      });

      if (!args.json) {
        progress(args, `${check.ok ? "✓" : "✗"} ${item.account.title}: ${check.detail}`);
      }
    }
  };

  await Promise.all(Array.from({ length: 6 }, worker));
  rows.sort((a, b) => a.index - b.index);

  const working = rows.filter((row) => row.ok).length;
  const unpaid = rows.filter((row) => row.status === 402).length;
  const rejected = rows.filter((row) => row.status === 407).length;
  const other = rows.length - working - unpaid - rejected;

  out(
    args,
    `Proxy check (CONNECT to a Telegram data centre)\n` +
      `  working     ${working}\n` +
      `  unpaid 402  ${unpaid}\n` +
      `  auth 407    ${rejected}\n` +
      `  other       ${other}` +
      (missing.length ? `\n  absent      ${missing.length} range entries not in THE-NILE` : ""),
    { rows, missing, working, unpaid, rejected },
  );
}

/** Probe a TCP endpoint without throwing. */
function probeTcp(host, port, timeoutMs = 6000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

/** `grace doctor` — one pass over the things that usually break a run. */
async function cmdDoctor(args) {
  const checks = [];
  const record = (ok, label, detail) => checks.push({ ok, label, detail });

  let appRunning = false;
  try {
    assertAppClosed();
  } catch {
    appRunning = true;
  }
  record(!appRunning, "THE-NILE closed", appRunning ? "close it before any storage write" : "storage is writable");

  const accounts = loadAccounts();
  record(accounts.length > 0, "accounts in THE-NILE", `${accounts.length}`);

  let server = null;
  try {
    server = resolveServer(args);
    record(true, "cloud address", server);
  } catch (error) {
    record(false, "cloud address", error.message);
  }

  const session = readSession(defaultGraceDir());
  record(Boolean(session?.token), "manager login", session?.token ? `as ${session.user?.username ?? session.user?.name ?? "admin"}` : "run `grace login`");

  const raw = loadRawAccounts();
  const proxied = raw.filter((account) => accountProxy(account) !== null).length;
  record(true, "accounts with a proxy", `${proxied}/${raw.length}`);

  const partitioned = partitionDirs();
  record(partitioned.size === accounts.length, "account partitions", `${partitioned.size}/${accounts.length}`);

  const dirs = [...partitioned.values()];
  const pointed = dirs.filter((dir) => {
    const settings = readStoredValue(dir, SETTINGS_KEY);
    return settings && typeof settings === "object" && settings.cloudServer === server;
  }).length;
  record(pointed === accounts.length, "mini-app address", `${pointed}/${accounts.length} on ${server ?? "?"}`);

  try {
    const baked = bakedCloudServer(extensionDir());
    record(baked === server, "extension default", `${baked ?? "(none)"}`);
  } catch (error) {
    record(false, "extension default", error.message);
  }

  const telegram = await probeTcp("149.154.167.51", 443);
  record(telegram, "Telegram reachable", telegram ? "DC2 accepts TCP on 443" : "no direct route; a proxy is required");

  if (session?.token && server) {
    try {
      const rows = await members(server, { token: session.token });
      const subscribed = rows.filter((row) => (row.subscriptions?.length ?? 0) > 0).length;
      record(true, "server members", `${rows.length} (${subscribed} subscribed)`);
    } catch (error) {
      record(false, "server members", error.message);
    }
  }

  const ok = checks.every((check) => check.ok);
  out(
    args,
    checks.map((check) => `${check.ok ? "✓" : "✗"} ${check.label.padEnd(22)} ${check.detail}`).join("\n") +
      `\n\n${ok ? "everything checks out" : "fix the ✗ lines above"}`,
    { ok, checks },
  );

  if (!ok) process.exitCode = 1;
}

async function cmdAddresses(args) {
  const accounts = loadAccounts();
  const dirs = partitionDirs();

  const rows = accounts.map((account) => {
    const partitionDir = dirs.get(account.index) ?? null;
    let cloudServer = null;

    if (partitionDir) {
      const settings = readStoredValue(partitionDir, SETTINGS_KEY);
      if (settings && typeof settings === "object") {
        cloudServer = settings.cloudServer ?? null;
      } else if (typeof settings === "string") {
        cloudServer = settings;
      }
    }

    return {
      index: account.index,
      title: account.title,
      cloudServer,
      readable: Boolean(partitionDir),
    };
  });

  const counts = new Map();
  for (const row of rows) {
    const key = row.cloudServer || "(not set)";
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const summary = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([address, count]) => `  ${String(count).padStart(4)}  ${address}`)
    .join("\n");

  const effective = (() => {
    try {
      return resolveServer(args);
    } catch {
      return null;
    }
  })();

  out(
    args,
    `effective  ${effective ?? "(none configured — run `grace server <url>`)"}\n` +
      `accounts   ${rows.length}\n\n` +
      `cloud addresses in use:\n${summary}`,
    { effective, total: rows.length, counts: Object.fromEntries(counts), accounts: rows },
  );
}

async function cmdLogin(args) {
  const server = resolveServer(args);
  const email = await resolveValue({
    flag: args.email,
    env: "GRACE_EMAIL",
    label: "Manager email: ",
    interactive: process.stdin.isTTY,
  });
  const password = await resolveValue({
    flag: args.password,
    env: "GRACE_PASSWORD",
    label: "Manager password: ",
    interactive: process.stdin.isTTY,
  });
  if (!email || !password) throw new Error("Email and password are required");

  const { token, user } = await login(server, { email, password });

  const session = {
    server,
    token,
    user,
    obtainedAt: new Date().toISOString(),
  };
  const dir = defaultGraceDir();
  writeSession(dir, session);
  /* Remember the address too, so later commands do not need --server. */
  saveServer(dir, server);

  out(
    args,
    `✓ Logged in to ${server} as ${user?.username || user?.email || email}\n` +
      `  token ${mask(token)}\n` +
      `  saved to ${sessionFilePath(dir)}`,
    { ok: true, server, user, file: sessionFilePath(dir) },
  );
}

function cmdShow(args) {
  const dir = defaultGraceDir();
  const session = readSession(dir);

  let server = null;
  try {
    server = resolveServer(args);
  } catch {
    server = null;
  }

  if (!session?.token) {
    out(
      args,
      `${server ? `server     ${server} (${serverSource(args)})\n` : ""}` +
        `No cloud session stored (looked in ${sessionFilePath(dir)}).`,
      { stored: false, server, file: sessionFilePath(dir) },
    );
    return;
  }

  out(
    args,
    `server     ${server ?? session.server}\n` +
      `source     ${serverSource(args)}\n` +
      `user       ${session.user?.username || session.user?.email || "?"}\n` +
      `token      ${mask(session.token)}\n` +
      `obtainedAt ${session.obtainedAt || "?"}\n` +
      `file       ${sessionFilePath(dir)}`,
    {
      stored: true,
      server: server ?? session.server,
      source: serverSource(args),
      user: session.user ?? null,
      tokenMasked: mask(session.token),
      obtainedAt: session.obtainedAt ?? null,
      file: sessionFilePath(dir),
    },
  );
}

async function cmdAdd(args) {
  const session = requireSession();
  const server = resolveServer(args);
  const accounts = loadAccounts();
  const { indices, picked, missing } = selectAccounts(
    accounts,
    args.range || "all",
  );
  if (picked.length === 0) throw new Error("No matching accounts to add");

  const before = await members(server, { token: session.token });

  await addAccounts(server, {
    token: session.token,
    ids: picked.map((account) => account.id),
    date: args.date || DEFAULT_DATE,
  });

  const after = await members(server, { token: session.token });

  out(
    args,
    `✓ Added ${picked.length} account(s) to ${server}\n` +
      `  range      ${indices[0]}–${indices[indices.length - 1]} (${indices.length} selected)\n` +
      `  expiry     ${args.date || DEFAULT_DATE}\n` +
      `  members    ${before.length} → ${after.length}` +
      (missing.length ? `\n  skipped    ${missing.length} not found in THE-NILE` : ""),
    {
      ok: true,
      requested: picked.length,
      membersBefore: before.length,
      membersAfter: after.length,
      missing,
    },
  );
}

async function cmdStatus(args) {
  const session = requireSession();
  const server = resolveServer(args);
  const accounts = loadAccounts();
  const { picked } = selectAccounts(accounts, args.range || "all");

  const all = await members(server, { token: session.token });
  const known = new Map(all.map((row) => [row.id, row]));

  const withSession = picked.filter(
    (account) => known.get(account.id)?.session,
  );
  const withSub = picked.filter(
    (account) => known.get(account.id)?.subscriptions?.length,
  );
  const notOnServer = picked.filter((account) => !known.has(account.id));

  out(
    args,
    `server ${server}\n` +
      `  on server          ${all.length} member(s) total\n` +
      `  selected           ${picked.length}\n` +
      `  with subscription  ${withSub.length}\n` +
      `  with cloud session ${withSession.length}\n` +
      `  not on server      ${notOnServer.length}`,
    {
      server,
      totalMembers: all.length,
      selected: picked.length,
      withSubscription: withSub.length,
      withCloudSession: withSession.length,
      notOnServer: notOnServer.map((account) => account.index),
    },
  );
}

/**
 * Make sure the selected accounts are on the cloud server before minting.
 *
 * `/api/telegram/code` answers 403 "Not allowed!" for an account without an
 * active subscription — and only *after* Telegram has sent a code, which leaves
 * the run failing one account at a time for a reason that has nothing to do with
 * Telegram. Adding them first costs one request and makes the run deterministic.
 *
 * @returns {Promise<{added: number, already: number}>}
 */
async function ensureRegistered(args, server, picked) {
  const session = requireSession();
  const existing = await members(server, { token: session.token });
  const missing = accountsNeedingRegistration(picked, existing);

  if (missing.length === 0) {
    return { added: 0, already: picked.length };
  }

  await addAccounts(server, {
    token: session.token,
    ids: missing.map((account) => account.id),
    date: args.date || DEFAULT_DATE,
  });

  return { added: missing.length, already: picked.length - missing.length };
}

/**
 * Put the address into each account's mini-app, so an account farms the same
 * server its cloud session was minted on.
 *
 * Returns null when `--no-point` asks to leave the app alone.
 */
function ensurePointed(args, server, picked) {
  if (args.noPoint) return null;
  assertAppClosed();
  return pointAccounts(picked, server);
}

/**
 * Make a login failure explain itself.
 *
 * A 403 here means the account is unknown to the server, not that Telegram
 * rejected it, and that distinction is the difference between "add the account"
 * and "the phone number is wrong".
 */
function explainLoginError(message, server) {
  if (/Not allowed|\(403\)/i.test(message)) {
    return (
      `${message} — the account is not added on ${server} (or has no active ` +
      "subscription). Run `grace add <range>` first."
    );
  }
  return message;
}

/**
 * Mint cloud sessions headlessly, the way the mini-app's Quick Sign-In does.
 *
 * The account's local Telegram session supplies the phone number and the login
 * code, so nothing is typed and no phone list is needed.
 */
/**
 * Mint a session for each account, retrying a passing network failure once.
 *
 * A retry is only spent on a transport error: an account whose 2FA was rejected
 * or whose session is revoked would fail the same way again, and asking for a
 * second login code would just send another message to that account.
 *
 * @param {object} args
 * @param {string} server
 * @param {Array<{index: number, title: string}>} picked
 * @param {{attempts?: number}} [options]
 * @returns {Promise<Array<object>>}
 */
async function mintPicked(args, server, picked, { attempts = 2 } = {}) {
  const dirs = partitionDirs();
  const candidates = twoFactorCandidates(args, server);
  const codeTimeoutMs = args.codeTimeout
    ? Math.max(1, Number(args.codeTimeout)) * 1000
    : undefined;

  const results = [];

  for (const [position, account] of picked.entries()) {
    const partitionDir = dirs.get(account.index);
    const sessionString = partitionDir
      ? readStoredValue(partitionDir, LOCAL_SESSION_KEY)
      : null;

    if (typeof sessionString !== "string" || !sessionString) {
      const reason = partitionDir
        ? "no local Telegram session (open the account's Local Session screen once, and close THE-NILE if it is running)"
        : "account has no partition in config.json";
      results.push({ index: account.index, ok: false, reason });
      progress(args, `– ${account.title}: ${reason}`);
      continue;
    }

    let row = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const result = await mintCloudSession({
          server,
          sessionString,
          passwords: candidates,
          codeTimeoutMs,
          deps: {
            openClient: openTelegramClient,
            cloud: { telegramLoginStart, telegramLoginCode, telegramLoginPassword },
          },
        });

        row = { ...result, index: account.index };
        progress(args, `✓ ${account.title}: cloud session minted (${result.phone})`);
        break;
      } catch (error) {
        const transient = isTransientMintError(error.message);

        if (transient && attempt < attempts) {
          progress(args, `· ${account.title}: ${error.message} — retrying`);
          await delay(3000);
          continue;
        }

        const message = explainLoginError(error.message, server);
        row = { index: account.index, ok: false, error: message };
        progress(args, `✗ ${account.title}: ${message}`);
      }
    }

    results.push(row);

    if (position < picked.length - 1) await delay(QUICK_ACCOUNT_DELAY_MS);
  }

  return results;
}

/**
 * `grace provision` — the whole run, in the order the server requires.
 *
 * Re-running is the recovery path: registration and pointing are idempotent,
 * and accounts that already hold a session are skipped unless `--remint`.
 */
async function cmdProvision(args) {
  const server = resolveServer(args);
  const accounts = loadAccounts();
  const { picked, missing } = selectAccounts(accounts, args.range || "all");
  if (picked.length === 0) throw new Error("No matching accounts");

  if (!args.noExtension) {
    try {
      const result = repointExtension(extensionDir(), server, { dryRun: args.dryRun });
      progress(
        args,
        result.files
          ? `+ extension repointed ${result.from} → ${result.to} (backup ${result.backup})`
          : `· extension already points at ${result.to}`,
      );
    } catch (error) {
      progress(args, `! extension not repointed (${error.message})`);
    }
  }

  if (args.dryRun) {
    progress(args, `· dry run: would add any missing accounts and point ${picked.length} at ${server}`);
  } else {
    try {
      const ensured = await ensureRegistered(args, server, picked);
      progress(
        args,
        ensured.added
          ? `+ added ${ensured.added} account(s) to ${server}`
          : `· all ${ensured.already} account(s) already subscribed`,
      );
    } catch (error) {
      progress(args, `! could not verify registration (${error.message})`);
    }

    try {
      const pointed = ensurePointed(args, server, picked);
      if (pointed) {
        const changed = pointed.filter((row) => row.ok && row.changed).length;
        progress(
          args,
          changed
            ? `+ pointed ${changed} account(s) at ${server}`
            : `· all account(s) already point at ${server}`,
        );
      }
    } catch (error) {
      progress(args, `! could not update the mini-app address (${error.message})`);
    }
  }

  const session = requireSession();
  let onServer = [];
  try {
    onServer = await members(server, { token: session.token });
  } catch (error) {
    progress(args, `! could not read members (${error.message}); minting the whole range`);
  }

  const toMint = args.remint ? picked : accountsMissingSession(picked, onServer);
  progress(
    args,
    `· ${picked.length - toMint.length} of ${picked.length} account(s) already have a session, ` +
      `${toMint.length} to mint`,
  );

  if (args.dryRun) {
    out(
      args,
      `would mint ${toMint.map((account) => account.title).join(", ") || "nothing"}`,
      { server, dryRun: true, wouldMint: toMint.map((account) => account.index) },
    );
    exitWhenFlushed();
    return;
  }

  const results = await mintPicked(args, server, toMint);
  const minted = results.filter((row) => row.ok).length;
  const failed = results.filter((row) => !row.ok);

  let remaining = [];
  try {
    const after = await members(server, { token: session.token });
    remaining = accountsMissingSession(picked, after);
  } catch {
    remaining = failed.map((row) => ({ index: row.index }));
  }

  out(
    args,
    `\n${minted}/${toMint.length} minted in this run` +
      (failed.length ? `, ${failed.length} failed` : "") +
      `\n${picked.length - remaining.length}/${picked.length} account(s) now have a cloud session` +
      (remaining.length
        ? `\nremaining: ${remaining.map((row) => row.index).join(", ")}`
        : "\nremaining: none") +
      (missing.length ? `\n(${missing.length} range entries absent)` : ""),
    {
      server,
      minted,
      failed: failed.map((row) => ({ index: row.index, error: row.error })),
      remaining: remaining.map((row) => row.index),
      missing,
    },
  );

  if (remaining.length) process.exitCode = 1;
  exitWhenFlushed();
}

async function quickSession(args, picked, missing) {
  const server = resolveServer(args);

  /* Cloud login only works for accounts the server already knows, so add the
   * missing ones before Telegram is involved at all. */
  try {
    const ensured = await ensureRegistered(args, server, picked);
    progress(
      args,
      ensured.added
        ? `+ added ${ensured.added} account(s) to ${server} first`
        : `· all ${ensured.already} account(s) already subscribed on ${server}`,
    );
  } catch (error) {
    progress(
      args,
      `! could not verify registration (${error.message}); accounts must already be added or /code will refuse`,
    );
  }

  try {
    const pointed = ensurePointed(args, server, picked);
    if (pointed) {
      const changed = pointed.filter((row) => row.ok && row.changed).length;
      progress(
        args,
        changed
          ? `+ pointed ${changed} account(s) at ${server} in THE-NILE`
          : `· all account(s) already point at ${server}`,
      );
    }
  } catch (error) {
    progress(args, `! could not update the mini-app address (${error.message})`);
  }

  const results = await mintPicked(args, server, picked);

  out(
    args,
    `\n${results.filter((row) => row.ok).length}/${results.length} cloud sessions minted` +
      (missing.length ? ` (${missing.length} range entries absent)` : ""),
    { results, missing },
  );

  exitWhenFlushed();
}

async function cmdSession(args) {
  const server = resolveServer(args);
  const accounts = loadAccounts();
  const { picked, missing } = selectAccounts(accounts, args.range || "all");
  if (picked.length === 0) throw new Error("No matching accounts");

  if (args.quick) return quickSession(args, picked, missing);

  /* Same prerequisite as the quick path: an account the server does not know
   * is refused by /code, after a code has already been sent. */
  try {
    const ensured = await ensureRegistered(args, server, picked);
    progress(
      args,
      ensured.added
        ? `+ added ${ensured.added} account(s) to ${server} first`
        : `· all ${ensured.already} account(s) already subscribed on ${server}`,
    );
  } catch (error) {
    progress(
      args,
      `! could not verify registration (${error.message}); accounts must already be added or /code will refuse`,
    );
  }

  try {
    const pointed = ensurePointed(args, server, picked);
    if (pointed) {
      const changed = pointed.filter((row) => row.ok && row.changed).length;
      progress(
        args,
        changed
          ? `+ pointed ${changed} account(s) at ${server} in THE-NILE`
          : `· all account(s) already point at ${server}`,
      );
    }
  } catch (error) {
    progress(args, `! could not update the mini-app address (${error.message})`);
  }

  let candidates = twoFactorCandidates(args, server);
  if (candidates.length === 0 && process.stdin.isTTY) {
    const typed = await resolveValue({
      label: "2FA password (blank to skip): ",
      env: "GRACE_PASSWORD",
      interactive: true,
    });
    candidates = normalizePasswords(typed);
  }

  const phones = readPhones(args.phones);
  const results = [];

  for (const account of picked) {
    const phone = phones.get(account.index) || phones.get(account.id);
    if (!phone) {
      results.push({ index: account.index, ok: false, reason: "no phone" });
      progress(args, `– ${account.title}: no phone number, skipped`);
      continue;
    }

    try {
      const started = await telegramLoginStart(server, phone);
      const code = await promptValue(
        `${account.title} (${phone}) login code: `,
      );
      let result = await telegramLoginCode(server, {
        session: started.session,
        code,
      });

      if (!result.user && result.stage === "password") {
        for (const candidate of candidates) {
          try {
            const attempt = await telegramLoginPassword(server, {
              session: started.session,
              password: candidate,
            });
            if (attempt.user) {
              result = attempt;
              break;
            }
          } catch {
            /* Wrong password for this account; try the next candidate. */
          }
        }
      }

      const ok = Boolean(result.user);
      results.push({ index: account.index, ok, session: started.session });
      progress(
        args,
        `${ok ? "✓" : "✗"} ${account.title}: ${ok ? "session minted" : "not authenticated"}`,
      );
    } catch (error) {
      const message = explainLoginError(error.message, server);
      results.push({ index: account.index, ok: false, reason: message });
      progress(args, `✗ ${account.title}: ${message}`);
    }
  }

  out(
    args,
    `\n${results.filter((r) => r.ok).length}/${results.length} cloud sessions minted` +
      (missing.length ? ` (${missing.length} range entries absent)` : ""),
    { results, missing },
  );
}

/* ── helpers ──────────────────────────────────────────────────────────── */

function readPhones(path) {
  const map = new Map();
  if (!path) return map;
  if (!existsSync(path)) throw new Error(`Phones file not found: ${path}`);

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, phone] = trimmed.split(/[,\t;]/).map((part) => part.trim());
    if (!phone) continue;
    if (/^\d+$/.test(key)) map.set(Number(key), phone);
    map.set(key, phone);
  }
  return map;
}

async function promptValue(label) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(label)).trim();
  } finally {
    rl.close();
  }
}

/**
 * Read a password without echoing it.
 *
 * No dependency: raw mode, collect characters, print nothing. Non-interactive
 * runs must set the env var instead, because a hidden prompt with no TTY would
 * hang forever.
 */
async function promptHidden(label) {
  if (!process.stdin.isTTY) {
    throw new Error("set GRACE_VAULT_PASSWORD for a non-interactive run");
  }

  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  return new Promise((resolve, reject) => {
    let value = "";

    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("data", onData);
    };

    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          cleanup();
          process.stdout.write("\n");
          reject(new Error("cancelled"));
          return;
        }
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    };

    process.stdin.on("data", onData);
  });
}

/* ── entry point ──────────────────────────────────────────────────────── */

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.help || !args.command) {
    process.stdout.write(USAGE);
    return;
  }

  switch (args.command) {
    case "server":
      return cmdServer(args);
    case "addresses":
      return cmdAddresses(args);
    case "login":
      return cmdLogin(args);
    case "show":
      return cmdShow(args);
    case "add":
      return cmdAdd(args);
    case "point":
      return cmdPoint(args);
    case "extension":
      return cmdExtension(args);
    case "proxies":
      return cmdProxies(args);
    case "doctor":
      return cmdDoctor(args);
    case "status":
      return cmdStatus(args);
    case "session":
      return cmdSession(args);
    case "provision":
      return cmdProvision(args);
    case "wallets":
      return cmdWallets(args);
    default:
      throw new Error(`Unknown command "${args.command}"\n\n${USAGE}`);
  }
}

main().catch((error) => {
  process.stderr.write(`grace: ${error.message}\n`);
  process.exitCode = 1;
});

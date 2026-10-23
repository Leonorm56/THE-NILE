import test from "node:test";
import assert from "node:assert/strict";

import {
  parseAccountNumber,
  vaultWalletMap,
  walletPlan,
} from "../src/main/libs/walletMap.mjs";
import { buildScpArgs, buildSshArgs } from "../src/main/libs/sshExec.mjs";

/* ── vault parsing ────────────────────────────────────────────────────── */

const vault = {
  "nilevault:wallets": [
    { id: "a", name: "ACCOUNT 2" },
    { id: "b", name: "ACCOUNT 3" },
    { id: "c", name: "ACCOUNT 4" },
    { id: "d", name: "ACCOUNT 5" },
    { id: "e", name: "ACCOUNT 5" },
    { id: "f", name: "My spending wallet" },
    { id: "g", name: "account 9" },
  ],
  "account-a:nile-wallet": { address: "EQ_A", rawAddress: "0:aa" },
  "account-b:nile-wallet": { address: "EQ_B", rawAddress: "0:bb" },
  "account-c:nile-wallet": { rawAddress: "0:cc" },
  "account-d:nile-wallet": { address: "EQ_D_FIRST", rawAddress: "0:dd" },
  "account-e:nile-wallet": { address: "EQ_E_SECOND", rawAddress: "0:ee" },
  "account-f:nile-wallet": { address: "EQ_F", rawAddress: "0:ff" },
  "account-g:nile-wallet": { address: "EQ_G", rawAddress: "0:gg" },
};

test("parseAccountNumber reads the trailing number from ACCOUNT labels", () => {
  assert.equal(parseAccountNumber("ACCOUNT 6"), 6);
  assert.equal(parseAccountNumber("ACCOUNT 187"), 187);
  assert.equal(parseAccountNumber("  ACCOUNT   12 "), 12);
});

test("parseAccountNumber refuses labels that are not account numbers", () => {
  assert.equal(parseAccountNumber("My spending wallet"), null);
  assert.equal(parseAccountNumber("ACCOUNT"), null);
  assert.equal(parseAccountNumber("ACCOUNT 0"), null);
  assert.equal(parseAccountNumber("ACCOUNT six"), null);
  assert.equal(parseAccountNumber(undefined), null);
});

test("vaultWalletMap keys wallets by their account number", () => {
  const map = vaultWalletMap(vault);

  assert.deepEqual([...map.keys()].sort((a, b) => a - b), [2, 3, 5]);
  assert.equal(map.get(2).address, "EQ_A");
  assert.equal(map.get(2).label, "ACCOUNT 2");
});

test("vaultWalletMap keeps the first address for a duplicated label", () => {
  const map = vaultWalletMap(vault);

  assert.equal(map.get(5).address, "EQ_D_FIRST");
});

test("vaultWalletMap skips a wallet with no address on disk", () => {
  const map = vaultWalletMap(vault);

  assert.equal(map.has(4), false);
});

test("vaultWalletMap only reads the labels it was told to trust", () => {
  const map = vaultWalletMap(vault, { labelPrefix: "account" });

  /* Case-sensitive on purpose: a lower-case label is a different wallet name,
   * not a silent match that could pick the wrong address. */
  assert.deepEqual([...map.keys()].sort((a, b) => a - b), [9]);
});

test("vaultWalletMap tolerates a vault with no wallets key", () => {
  assert.equal(vaultWalletMap({}).size, 0);
});

/* ── joining wallets to accounts ──────────────────────────────────────── */

const accounts = [
  { index: 2, id: 222, title: "second" },
  { index: 3, id: "000333", title: "third" },
  { index: 4, id: 444, title: "fourth" },
  { index: 5, id: 555, title: "fifth" },
];

test("walletPlan pairs each account with the wallet of the same position", () => {
  const plan = walletPlan(accounts, vaultWalletMap(vault));

  assert.deepEqual(
    plan.rows.map((row) => [row.position, row.telegramId, row.address]),
    [
      [2, "222", "EQ_A"],
      [3, "000333", "EQ_B"],
      [5, "555", "EQ_D_FIRST"],
    ],
  );
});

test("walletPlan reports an account with no wallet instead of inventing one", () => {
  const plan = walletPlan(accounts, vaultWalletMap(vault));

  assert.deepEqual(plan.missing, [
    { position: 4, reason: "no vault wallet" },
  ]);
});

test("walletPlan keeps account ids as strings so leading zeros survive", () => {
  const plan = walletPlan(accounts, vaultWalletMap(vault));

  assert.equal(typeof plan.rows[1].telegramId, "string");
  assert.equal(plan.rows[1].telegramId, "000333");
});

test("walletPlan never carries a wallet for a position it was not given", () => {
  const plan = walletPlan([{ index: 2, id: 222 }], vaultWalletMap(vault));

  assert.deepEqual(plan.rows.map((row) => row.position), [2]);
});

/* ── ssh invocation ───────────────────────────────────────────────────── */

test("buildSshArgs keeps the key path intact and never goes interactive", () => {
  const args = buildSshArgs({
    host: "ubuntu@1.2.3.4",
    key: "C:\\Users\\GH\\My Keys\\srv.pem",
    command: "node script.mjs --dry",
  });

  assert.deepEqual(args.slice(0, 2), ["-i", "C:\\Users\\GH\\My Keys\\srv.pem"]);
  assert.ok(args.includes("BatchMode=yes"));
  assert.equal(args.at(-2), "ubuntu@1.2.3.4");
  assert.equal(args.at(-1), "node script.mjs --dry");
});

test("buildScpArgs uploads to the remote home, not an invented path", () => {
  const args = buildScpArgs({
    key: "C:\\keys\\srv.pem",
    local: "C:\\tmp\\plan.json",
    remote: "ubuntu@1.2.3.4:plan.json",
  });

  assert.deepEqual(args.slice(0, 2), ["-i", "C:\\keys\\srv.pem"]);
  assert.equal(args.at(-2), "C:\\tmp\\plan.json");
  assert.equal(args.at(-1), "ubuntu@1.2.3.4:plan.json");
});

test("buildSshArgs refuses to run without a host", () => {
  assert.throws(() => buildSshArgs({ key: "k", command: "x" }), /host/i);
});

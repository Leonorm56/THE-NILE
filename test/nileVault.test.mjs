import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";

import {
  decryptVaultBlob,
  deriveVaultKey,
  openVault,
  walletContractVersion,
} from "../src/main/libs/nileVault.mjs";

/* ── a synthetic vault, encrypted exactly as NileVault does ───────────── */

const CHECK = "nile-vault-ok";
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function seal(text, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, body, cipher.getAuthTag()]).toString(
    "base64",
  );
}

function buildVault({ password = "correct horse", phrase = "one two three" } = {}) {
  const salt = randomBytes(32).toString("base64");
  const key = scryptSync(password, Buffer.from(salt, "base64"), 32, SCRYPT);

  return {
    vault: {
      "shared:nile-wallet:vault": { salt, check: seal(CHECK, key) },
      "nilevault:wallets": [{ id: "w1", name: "ACCOUNT 20" }],
      "account-w1:nile-wallet": {
        address: "UQ_test",
        platform: "v4r2",
        encrypted: seal(phrase, key),
      },
    },
    phrase,
  };
}

test("openVault decrypts the phrase for a wallet", () => {
  const { vault, phrase } = buildVault();
  const opened = openVault(vault, "correct horse");

  assert.equal(opened.phraseFor("w1"), phrase);
});

test("openVault rejects a wrong password before touching any wallet", () => {
  const { vault } = buildVault();

  assert.throws(() => openVault(vault, "wrong"), /wrong NileVault password/i);
});

test("openVault refuses a vault with no salt rather than guessing", () => {
  assert.throws(() => openVault({}, "x"), /NileVault vault/i);
});

test("openVault refuses a missing password", () => {
  const { vault } = buildVault();

  assert.throws(() => openVault(vault, ""), /password/i);
});

test("phraseFor names the wallet it could not open", () => {
  const { vault } = buildVault();
  const opened = openVault(vault, "correct horse");

  assert.throws(() => opened.phraseFor("nope"), /nope/);
});

test("a tampered ciphertext fails instead of returning garbage", () => {
  const { vault } = buildVault();
  const blob = Buffer.from(vault["account-w1:nile-wallet"].encrypted, "base64");
  blob[blob.length - 1] ^= 0xff;
  vault["account-w1:nile-wallet"].encrypted = blob.toString("base64");

  const opened = openVault(vault, "correct horse");
  assert.throws(() => opened.phraseFor("w1"));
});

test("deriveVaultKey refuses a salt that is not 32 bytes", () => {
  assert.throws(() => deriveVaultKey("pw", Buffer.from("short").toString("base64")), /salt/i);
});

test("decryptVaultBlob refuses an unknown cipher version", () => {
  const key = randomBytes(32);
  const bundle = Buffer.concat([Buffer.from([9]), randomBytes(40)]).toString("base64");

  assert.throws(() => decryptVaultBlob(bundle, key), /version/i);
});

test("walletContractVersion maps NileVault platforms to MRG's version numbers", () => {
  assert.equal(walletContractVersion("v4r2"), "4");
  assert.equal(walletContractVersion("v5r1"), "5");
  assert.equal(walletContractVersion("w5"), "5");
  assert.equal(walletContractVersion(""), null);
  assert.equal(walletContractVersion(undefined), null);
  assert.equal(walletContractVersion("v3r2"), null);
});

/**
 * GRACE — opening a NileVault vault, without the UI.
 *
 * NileVault stores each wallet's 24-word recovery phrase encrypted with a key
 * derived from the vault password: scrypt (N=2^15, r=8, p=1, 32 bytes) over a
 * per-vault salt, then AES-256-GCM. `shared:nile-wallet:vault.check` is a known
 * plaintext sealed with the same key, so a wrong password is rejected before
 * any wallet is decrypted.
 *
 * Only the phrase is ever returned. The derived key stays in this module's
 * closure, and callers are expected to hand the phrase straight to the signing
 * call — never to disk, argv or a log.
 */

import { createDecipheriv, scryptSync } from "node:crypto";

const CIPHER_VERSION = 1;
const IV_BYTES = 12;
const KEY_BYTES = 32;
const TAG_BYTES = 16;
const CHECK_PLAINTEXT = "nile-vault-ok";
const SALT_BYTES = 32;

/** The KDF parameters NileVault itself uses. maxmem must cover 128*N*r. */
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/**
 * Derive the vault key from the password and the vault's salt.
 *
 * @param {string} password
 * @param {string} saltB64
 * @returns {Buffer} 32-byte key
 */
export function deriveVaultKey(password, saltB64) {
  if (!password) throw new Error("NileVault password is required");

  const salt = Buffer.from(String(saltB64 || ""), "base64");
  if (salt.length !== SALT_BYTES) {
    throw new Error(`vault salt must be ${SALT_BYTES} bytes, got ${salt.length}`);
  }

  return scryptSync(password, salt, KEY_BYTES, SCRYPT);
}

/**
 * Decrypt one NileVault blob.
 *
 * Bundle layout: `[version][iv 12][ciphertext][tag 16]`, base64. The tag is
 * checked by AES-GCM, so a tampered blob throws instead of returning garbage.
 *
 * @param {string} encryptedB64
 * @param {Buffer} key
 * @returns {string}
 */
export function decryptVaultBlob(encryptedB64, key) {
  const bundle = Buffer.from(String(encryptedB64 || ""), "base64");

  if (bundle.length < 1 + IV_BYTES + TAG_BYTES) {
    throw new Error("vault blob is too short to be ciphertext");
  }

  const version = bundle[0];
  if (version !== CIPHER_VERSION) {
    throw new Error(`unsupported vault cipher version ${version}`);
  }

  const iv = bundle.subarray(1, 1 + IV_BYTES);
  const body = bundle.subarray(1 + IV_BYTES);
  const tag = body.subarray(body.length - TAG_BYTES);
  const ciphertext = body.subarray(0, body.length - TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8",
  );
}

/**
 * Unlock a parsed `vault.json`.
 *
 * The password is checked against `check` first; only then does `phraseFor`
 * become usable.
 *
 * @param {any} vault parsed vault.json
 * @param {string} password
 * @returns {{phraseFor: (walletId: string) => string}}
 */
export function openVault(vault, password) {
  const config = vault?.["shared:nile-wallet:vault"];
  if (!config?.salt || !config?.check) {
    throw new Error(
      "this is not a NileVault vault (no shared:nile-wallet:vault salt/check)",
    );
  }

  const key = deriveVaultKey(password, config.salt);

  let check = null;
  try {
    check = decryptVaultBlob(config.check, key);
  } catch {
    /* GCM authenticates before it returns plaintext, so a failure here is a
     * wrong key — report it as the password problem it is. */
    throw new Error("wrong NileVault password");
  }

  if (check !== CHECK_PLAINTEXT) throw new Error("wrong NileVault password");

  return {
    /**
     * @param {string} walletId
     * @returns {string} the 24-word phrase
     */
    phraseFor(walletId) {
      const record = vault?.[`account-${walletId}:nile-wallet`];
      if (!record?.encrypted) {
        throw new Error(`no wallet "${walletId}" with an encrypted phrase in this vault`);
      }

      const phrase = decryptVaultBlob(record.encrypted, key);
      if (!phrase.trim()) {
        throw new Error(`wallet "${walletId}" decrypted to an empty phrase`);
      }

      return phrase;
    },
  };
}

/**
 * The contract version number a bot should sign for.
 *
 * MRG asks "V5R1" or "V4"; NileVault records the platform as `v4r2`/`v5r1`.
 * Anything else is refused rather than mapped to a guess that would derive a
 * different address.
 *
 * @param {unknown} platform
 * @returns {"4"|"5"|null}
 */
export function walletContractVersion(platform) {
  const value = String(platform || "").toLowerCase();
  if (value.startsWith("v5") || value.startsWith("w5")) return "5";
  if (value.startsWith("v4") || value.startsWith("w4")) return "4";
  return null;
}

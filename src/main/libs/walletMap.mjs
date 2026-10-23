/**
 * GRACE — NileVault wallets, mapped onto farm accounts.
 *
 * NileVault names its wallets `ACCOUNT 6`, and that number is the farm
 * account's position: the two lists were built together and live binds proved
 * the pairing (position 3 and 5 were already bound to exactly `ACCOUNT 3` and
 * `ACCOUNT 5` before this code existed).
 *
 * Everything here is pure. The caller decides which accounts are in scope
 * (range parsing) and what to do with a plan; this module only answers "which
 * address belongs to which account", which is the part where a silent mistake
 * would cost real wallets.
 */

/**
 * Read the account number out of a wallet label.
 *
 * Only `ACCOUNT <n>` counts, with an exact prefix match: a wallet named
 * `account 9` or `My spending wallet` is a different wallet, not a fuzzy match
 * that could bind the wrong address. Case matters on purpose.
 *
 * @param {unknown} label
 * @param {string} [prefix]
 * @returns {number|null} position, or null when the label is not an account
 */
export function parseAccountNumber(label, prefix = "ACCOUNT") {
  if (typeof label !== "string") return null;

  const normalized = label.trim().replace(/\s+/g, " ");
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = normalized.match(new RegExp(`^${escaped} (\\d+)$`));
  if (!match) return null;

  const position = Number(match[1]);
  if (!Number.isSafeInteger(position) || position < 1) return null;
  return position;
}

/**
 * Build position → wallet from a parsed `vault.json`.
 *
 * A wallet with no `address` is not usable (it may be half-created or
 * encrypted), so it is skipped rather than carried as an empty string that
 * would later look like "bind no address". When two labels claim the same
 * position the first one wins: reordering the vault must not silently move a
 * different address onto an already-bound account.
 *
 * @param {any} vault parsed vault.json contents
 * @param {{labelPrefix?: string}} [options]
 * @returns {Map<number, {id: string, address: string, rawAddress: string|null, label: string, platform: string|null}>}
 */
export function vaultWalletMap(vault, { labelPrefix = "ACCOUNT" } = {}) {
  const wallets = Array.isArray(vault?.["nilevault:wallets"])
    ? vault["nilevault:wallets"]
    : [];

  /** @type {Map<number, {id: string, address: string, rawAddress: string|null, label: string, platform: string|null}>} */
  const map = new Map();

  for (const wallet of wallets) {
    if (!wallet || typeof wallet !== "object") continue;

    const position = parseAccountNumber(wallet.name, labelPrefix);
    if (position === null) continue;
    if (map.has(position)) continue;

    const record = vault?.[`account-${wallet.id}:nile-wallet`];
    const address = record?.address;
    if (typeof address !== "string" || address.trim() === "") continue;

    map.set(position, {
      /* Kept so a caller that needs the encrypted seed can find the record
       * without re-reading the vault and re-deriving the mapping. */
      id: String(wallet.id),
      address: address.trim(),
      rawAddress:
        typeof record?.rawAddress === "string" ? record.rawAddress : null,
      label: wallet.name,
      platform: typeof record?.platform === "string" ? record.platform : null,
    });
  }

  return map;
}

/**
 * Join the selected farm accounts to their wallets.
 *
 * Accounts without a wallet are reported, never guessed: the command can then
 * say "position 162 has no NileVault wallet" instead of skipping in silence.
 *
 * @param {Array<{index: number, id?: string|number}>} accounts
 * @param {Map<number, {address: string, rawAddress?: string|null, label?: string}>} wallets
 * @returns {{
 *   rows: Array<{position: number, telegramId: string, address: string, rawAddress: string|null, label: string|null}>,
 *   missing: Array<{position: number, reason: string}>,
 * }}
 */export function walletPlan(accounts, wallets) {
  const rows = [];
  const missing = [];

  for (const account of accounts) {
    const position = Number(account?.index);
    const wallet = wallets.get(position);

    if (!wallet) {
      missing.push({ position, reason: "no vault wallet" });
      continue;
    }

    rows.push({
      position,
      /* Strings: Telegram ids are larger than a safe integer in some exports,
       * and leading zeros exist in others. */
      telegramId: String(account.id),
      address: wallet.address,
      rawAddress: wallet.rawAddress ?? null,
      label: wallet.label ?? null,
    });
  }

  return { rows, missing };
}

/**
 * Country → plausible IANA timezone + language.
 *
 * Used to keep a profile's declared timezone and language consistent with the
 * exit country of its proxy. A residential IP in Nigeria reporting
 * America/New_York is a stronger signal than any single stale version string,
 * so the pairing matters more than the specific value.
 *
 * `zones` lists the timezones actually used by that country's population
 * centres; one is picked once, at fingerprint generation, and then persisted.
 */
const COUNTRIES = {
  ae: { zones: ["Asia/Dubai"], langs: ["ar-AE", "en-AE"] },
  ar: { zones: ["America/Argentina/Buenos_Aires"], langs: ["es-AR"] },
  at: { zones: ["Europe/Vienna"], langs: ["de-AT"] },
  au: {
    zones: ["Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane"],
    langs: ["en-AU"],
  },
  bd: { zones: ["Asia/Dhaka"], langs: ["bn-BD", "en-BD"] },
  be: { zones: ["Europe/Brussels"], langs: ["nl-BE", "fr-BE"] },
  br: {
    zones: ["America/Sao_Paulo", "America/Bahia", "America/Fortaleza"],
    langs: ["pt-BR"],
  },
  ca: {
    zones: ["America/Toronto", "America/Vancouver", "America/Edmonton"],
    langs: ["en-CA", "fr-CA"],
  },
  ch: { zones: ["Europe/Zurich"], langs: ["de-CH", "fr-CH"] },
  cl: { zones: ["America/Santiago"], langs: ["es-CL"] },
  co: { zones: ["America/Bogota"], langs: ["es-CO"] },
  cz: { zones: ["Europe/Prague"], langs: ["cs-CZ"] },
  de: { zones: ["Europe/Berlin"], langs: ["de-DE"] },
  dk: { zones: ["Europe/Copenhagen"], langs: ["da-DK"] },
  eg: { zones: ["Africa/Cairo"], langs: ["ar-EG", "en-EG"] },
  es: { zones: ["Europe/Madrid"], langs: ["es-ES"] },
  fi: { zones: ["Europe/Helsinki"], langs: ["fi-FI"] },
  fr: { zones: ["Europe/Paris"], langs: ["fr-FR"] },
  gb: { zones: ["Europe/London"], langs: ["en-GB"] },
  gh: { zones: ["Africa/Accra"], langs: ["en-GH"] },
  gr: { zones: ["Europe/Athens"], langs: ["el-GR"] },
  hk: { zones: ["Asia/Hong_Kong"], langs: ["zh-HK", "en-HK"] },
  hu: { zones: ["Europe/Budapest"], langs: ["hu-HU"] },
  id: {
    zones: ["Asia/Jakarta", "Asia/Makassar"],
    langs: ["id-ID"],
  },
  ie: { zones: ["Europe/Dublin"], langs: ["en-IE"] },
  il: { zones: ["Asia/Jerusalem"], langs: ["he-IL", "en-IL"] },
  in: { zones: ["Asia/Kolkata"], langs: ["en-IN", "hi-IN"] },
  iq: { zones: ["Asia/Baghdad"], langs: ["ar-IQ"] },
  ir: { zones: ["Asia/Tehran"], langs: ["fa-IR"] },
  it: { zones: ["Europe/Rome"], langs: ["it-IT"] },
  jp: { zones: ["Asia/Tokyo"], langs: ["ja-JP"] },
  ke: { zones: ["Africa/Nairobi"], langs: ["en-KE", "sw-KE"] },
  kr: { zones: ["Asia/Seoul"], langs: ["ko-KR"] },
  kz: { zones: ["Asia/Almaty"], langs: ["ru-KZ", "kk-KZ"] },
  ma: { zones: ["Africa/Casablanca"], langs: ["ar-MA", "fr-MA"] },
  mx: {
    zones: ["America/Mexico_City", "America/Monterrey"],
    langs: ["es-MX"],
  },
  my: { zones: ["Asia/Kuala_Lumpur"], langs: ["ms-MY", "en-MY"] },
  ng: { zones: ["Africa/Lagos"], langs: ["en-NG"] },
  nl: { zones: ["Europe/Amsterdam"], langs: ["nl-NL"] },
  no: { zones: ["Europe/Oslo"], langs: ["nb-NO"] },
  nz: { zones: ["Pacific/Auckland"], langs: ["en-NZ"] },
  pe: { zones: ["America/Lima"], langs: ["es-PE"] },
  ph: { zones: ["Asia/Manila"], langs: ["en-PH", "fil-PH"] },
  pk: { zones: ["Asia/Karachi"], langs: ["en-PK", "ur-PK"] },
  pl: { zones: ["Europe/Warsaw"], langs: ["pl-PL"] },
  pt: { zones: ["Europe/Lisbon"], langs: ["pt-PT"] },
  ro: { zones: ["Europe/Bucharest"], langs: ["ro-RO"] },
  rs: { zones: ["Europe/Belgrade"], langs: ["sr-RS"] },
  ru: {
    zones: ["Europe/Moscow", "Asia/Yekaterinburg", "Europe/Samara"],
    langs: ["ru-RU"],
  },
  sa: { zones: ["Asia/Riyadh"], langs: ["ar-SA"] },
  se: { zones: ["Europe/Stockholm"], langs: ["sv-SE"] },
  sg: { zones: ["Asia/Singapore"], langs: ["en-SG"] },
  th: { zones: ["Asia/Bangkok"], langs: ["th-TH"] },
  tr: { zones: ["Europe/Istanbul"], langs: ["tr-TR"] },
  tw: { zones: ["Asia/Taipei"], langs: ["zh-TW"] },
  ua: { zones: ["Europe/Kyiv"], langs: ["uk-UA", "ru-UA"] },
  us: {
    zones: [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Phoenix",
    ],
    langs: ["en-US"],
  },
  uz: { zones: ["Asia/Tashkent"], langs: ["uz-UZ", "ru-UZ"] },
  vn: { zones: ["Asia/Ho_Chi_Minh"], langs: ["vi-VN"] },
  za: { zones: ["Africa/Johannesburg"], langs: ["en-ZA"] },
};

/**
 * Resolve a country code to a timezone + language set.
 *
 * When the country is unknown, falls back to the host machine's own timezone
 * and language: with no proxy configured the traffic exits from the real IP,
 * so the real zone is the coherent answer. Claiming a US zone from a
 * non-US address would be the exact mismatch this is meant to avoid.
 *
 * @param {string|undefined|null} country ISO 3166-1 alpha-2, any casing
 * @param {() => number} random source of randomness, so callers can seed it
 * @returns {{country: string|null, timezone: string, lang: string, langs: string[]}}
 */
export const resolveCountry = (country, random = Math.random) => {
  const code = String(country || "")
    .trim()
    .toLowerCase()
    .slice(0, 2);

  const entry = COUNTRIES[code];

  if (!entry) {
    return { country: null, ...hostLocale() };
  }

  const timezone = entry.zones[Math.floor(random() * entry.zones.length)];
  const langs = entry.langs.slice();

  /* Telegram clients almost always carry an English fallback. */
  if (!langs.some((item) => item.startsWith("en"))) {
    langs.push("en");
  }

  return { country: code, timezone, lang: langs[0], langs };
};

/** The host machine's own timezone and language. */
export const hostLocale = () => {
  let timezone = "UTC";
  let lang = "en-US";

  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    timezone = "UTC";
  }

  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().locale;
    if (resolved && resolved.includes("-")) lang = resolved;
  } catch {
    lang = "en-US";
  }

  const langs = lang.startsWith("en") ? [lang] : [lang, "en"];

  return { timezone, lang, langs };
};

export const isKnownCountry = (country) =>
  Boolean(COUNTRIES[String(country || "").trim().toLowerCase().slice(0, 2)]);

export default COUNTRIES;

import { app } from "electron";
import { createHash } from "crypto";
import { join } from "path";
import fs from "fs";

import { resolveCountry } from "./timezones";

/** Root for per-profile state. One JSON + one spoof script per profile id. */
export const profilesRoot = () => join(app.getPath("userData"), "profiles");

/** Filesystem-safe id. Partitions look like "persist:<uuid>". */
export const safeId = (id) => String(id).replace(/[^a-zA-Z0-9._-]/g, "_");

export const profileDir = (id) => join(profilesRoot(), safeId(id));
export const profileFile = (id) => join(profilesRoot(), `${safeId(id)}.json`);

/**
 * Deterministic PRNG seeded from the profile id.
 *
 * Fingerprints are persisted, so this only matters on first generation — but
 * seeding from the id means a lost JSON file regenerates the *same* identity
 * rather than silently rotating the account's device.
 */
const seededRandom = (seed) => {
  const digest = createHash("sha256").update(String(seed)).digest();
  let a = digest.readUInt32LE(0) || 1;
  let b = digest.readUInt32LE(4) || 2;
  let c = digest.readUInt32LE(8) || 3;
  let d = digest.readUInt32LE(12) || 4;

  /* sfc32 */
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
};

/** Chrome majors paired with the Telegram-Android builds shipping alongside.
 *
 * `uaData.brands` must agree with the Chrome major in the UA string: Chromium
 * client hints are reported independently, so a mismatch between them is
 * self-inconsistent and trivially detectable. */
const CHROME_RELEASES = [
  { major: 141, build: "141.0.7390.122", telegram: "12.0.1" },
  { major: 142, build: "142.0.7444.103", telegram: "12.1.0" },
  { major: 143, build: "143.0.7499.116", telegram: "12.2.1" },
  { major: 144, build: "144.0.7559.134", telegram: "12.3.0" },
  { major: 145, build: "145.0.7623.147", telegram: "12.4.1" },
  { major: 146, build: "146.0.7680.177", telegram: "12.5.2" },
];

/** Android release → SDK level, plus the Chrome major current at its launch.
 * A device cannot run a Chrome build that predates its own OS. */
const ANDROID_VERSIONS = [
  { version: "12", sdk: 32, minChrome: 94 },
  { version: "13", sdk: 33, minChrome: 105 },
  { version: "14", sdk: 34, minChrome: 118 },
  { version: "15", sdk: 35, minChrome: 129 },
  { version: "16", sdk: 36, minChrome: 137 },
];

/** Devices with their real panel geometry, so screen size matches the model. */
const DEVICES = [
  { model: "SM-S911B", w: 360, h: 780, dpr: 3 },
  { model: "SM-S918B", w: 384, h: 824, dpr: 2.8125 },
  { model: "SM-S921B", w: 360, h: 780, dpr: 3 },
  { model: "SM-A546B", w: 360, h: 800, dpr: 3 },
  { model: "SM-A356B", w: 360, h: 800, dpr: 3 },
  { model: "SM-G991B", w: 360, h: 800, dpr: 3 },
  { model: "Pixel 7", w: 412, h: 915, dpr: 2.625 },
  { model: "Pixel 8", w: 412, h: 916, dpr: 2.625 },
  { model: "Pixel 8 Pro", w: 448, h: 998, dpr: 2.8125 },
  { model: "Pixel 9", w: 412, h: 923, dpr: 2.625 },
  { model: "2201117TY", w: 393, h: 873, dpr: 2.75 },
  { model: "23021RAAEG", w: 393, h: 873, dpr: 2.75 },
  { model: "CPH2451", w: 412, h: 919, dpr: 2.625 },
  { model: "TECNO CK7n", w: 360, h: 800, dpr: 3 },
  { model: "Infinix X6831", w: 360, h: 800, dpr: 3 },
];

/** Plausible core counts / RAM buckets for mid-to-high Android hardware. */
const CORES = [4, 6, 8, 8, 8];
const MEMORY = [4, 4, 8, 8];

const pick = (list, random) => list[Math.floor(random() * list.length)];

/**
 * Build a coherent fingerprint. Every field is derived from the same seeded
 * PRNG so the whole device story hangs together.
 *
 * @param {string} id profile id (partition)
 * @param {string|undefined} country proxy exit country, if known
 */
export const generateFingerprint = (id, country) => {
  const random = seededRandom(id);

  const android = pick(ANDROID_VERSIONS, random);

  /* Only Chrome builds that could actually run on this Android release. */
  const eligible = CHROME_RELEASES.filter((c) => c.major >= android.minChrome);
  const chrome = pick(eligible.length ? eligible : CHROME_RELEASES, random);

  const device = pick(DEVICES, random);
  const quality = random() < 0.75 ? "HIGH" : "MEDIUM";

  const { country: resolvedCountry, timezone, lang, langs } = resolveCountry(
    country,
    random
  );

  const ua =
    `Mozilla/5.0 (Linux; Android ${android.version}; K) ` +
    `AppleWebKit/537.36 (KHTML, like Gecko) ` +
    `Chrome/${chrome.build} Mobile Safari/537.36 ` +
    `Telegram-Android/${chrome.telegram} ` +
    `(${device.model}; Android ${android.version}; SDK ${android.sdk}; ${quality})`;

  /* Chrome reports a "Not-A.Brand" entry with a rotating placeholder version. */
  const notABrand = pick(["8", "24", "99"], random);

  return {
    ua,
    uaData: {
      brands: [
        { brand: "Chromium", version: String(chrome.major) },
        { brand: "Google Chrome", version: String(chrome.major) },
        { brand: "Not-A.Brand", version: notABrand },
      ],
      mobile: true,
      platform: "Android",
      platformVersion: `${android.version}.0.0`,
      architecture: "",
      bitness: "",
      model: device.model,
      uaFullVersion: chrome.build,
      fullVersionList: [
        { brand: "Chromium", version: chrome.build },
        { brand: "Google Chrome", version: chrome.build },
        { brand: "Not-A.Brand", version: `${notABrand}.0.0.0` },
      ],
    },
    lang,
    langs,
    screen: {
      w: device.w,
      h: device.h,
      /* Status + nav bars eat a little height; width is unaffected. */
      availW: device.w,
      availH: device.h - pick([0, 24, 48], random),
      dpr: device.dpr,
    },
    timezone,
    country: resolvedCountry,
    hardwareConcurrency: pick(CORES, random),
    deviceMemory: pick(MEMORY, random),
  };
};

/**
 * Load a profile's persisted record, generating it once if absent.
 *
 * Never regenerates an existing fingerprint: rotating a live account's device
 * identity is exactly the signal we are trying to avoid.
 *
 * @param {string} id profile id (partition)
 * @param {{country?: string, host?: string, port?: number, user?: string, pass?: string}} [proxy]
 * @returns {{id: string, profilePath: string, fingerprint: object, proxy: object}}
 */
export const loadProfileRecord = (id, proxy) => {
  const file = profileFile(id);

  fs.mkdirSync(profilesRoot(), { recursive: true });

  /** @type {any} */
  let record = null;

  try {
    if (fs.existsSync(file)) {
      record = JSON.parse(fs.readFileSync(file, "utf8"));
    }
  } catch (e) {
    console.error("Unreadable profile record, regenerating:", e?.message ?? e);
  }

  let dirty = false;

  if (!record || !record.fingerprint?.ua) {
    record = {
      id,
      profilePath: profileDir(id),
      fingerprint: generateFingerprint(id, proxy?.country),
      proxy: {
        host: proxy?.host ?? null,
        port: proxy?.port ?? null,
        user: proxy?.user ?? null,
        pass: proxy?.pass ?? null,
        country: proxy?.country ?? null,
      },
    };
    dirty = true;
  } else {
    /* Keep the stored proxy details current without touching the fingerprint.
     * The timezone deliberately stays sticky: it must not flip when a proxy
     * goes offline or is swapped out. */
    const next = {
      host: proxy?.host ?? record.proxy?.host ?? null,
      port: proxy?.port ?? record.proxy?.port ?? null,
      user: proxy?.user ?? record.proxy?.user ?? null,
      pass: proxy?.pass ?? record.proxy?.pass ?? null,
      country: proxy?.country ?? record.proxy?.country ?? null,
    };

    if (JSON.stringify(next) !== JSON.stringify(record.proxy)) {
      record.proxy = next;
      dirty = true;
    }

    /* First time we learn a country, align the timezone with it — once. */
    if (proxy?.country && !record.fingerprint.country) {
      const resolved = resolveCountry(proxy.country, seededRandom(id));

      record.fingerprint.country = resolved.country;
      record.fingerprint.timezone = resolved.timezone;
      record.fingerprint.lang = resolved.lang;
      record.fingerprint.langs = resolved.langs;
      dirty = true;
    }

    if (!record.profilePath) {
      record.profilePath = profileDir(id);
      dirty = true;
    }
  }

  if (dirty) {
    try {
      /* tmp-then-rename so a crash mid-write cannot truncate the record. */
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(record, null, 2));
      fs.renameSync(tmp, file);
    } catch (e) {
      console.error("Failed to persist profile record:", e?.message ?? e);
    }
  }

  return record;
};

/** Delete a profile's persisted record and generated files. */
export const removeProfileRecord = (id) => {
  try {
    fs.rmSync(profileFile(id), { force: true });
    fs.rmSync(profileDir(id), { recursive: true, force: true });
  } catch (e) {
    console.error("Failed to remove profile record:", e?.message ?? e);
  }
};

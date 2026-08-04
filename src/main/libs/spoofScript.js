import { join } from "path";
import fs from "fs";

import { profileDir } from "./fingerprint";

/**
 * Body of the per-profile spoof preload.
 *
 * Written to disk with the fingerprint inlined as a JSON literal, because a
 * preload script registered on a session cannot receive per-profile arguments
 * and must run before any page script — no room for an async IPC round-trip.
 *
 * Every override is non-enumerable and reports a native-looking toString, so
 * a casual `Object.keys` / `Function.prototype.toString` probe does not show
 * the seams. This is not proof against a determined fingerprinting suite; it
 * closes the gap where every instance looked like the same Windows desktop.
 */
const TEMPLATE = `
(() => {
  "use strict";

  /* Only spoof real web content.
   *
   * A frame preload runs everywhere in the session, including the extension's
   * own pages. Overriding devicePixelRatio there rescales the extension UI —
   * CSS pixels, media queries and rem math all derive from it — so the panel
   * renders at the wrong proportions. Extension pages are our own UI and are
   * never the thing being fingerprinted, so leave them untouched. */
  try {
    const proto = location.protocol;
    if (
      proto === "chrome-extension:" ||
      proto === "devtools:" ||
      proto === "chrome:" ||
      proto === "file:"
    ) {
      return;
    }
  } catch {}

  const FP = __FINGERPRINT__;

  /** Make a patched function report native source. */
  const nativeize = (fn, name) => {
    try {
      Object.defineProperty(fn, "name", { value: name, configurable: true });
      Object.defineProperty(fn, "toString", {
        value: () => "function " + name + "() { [native code] }",
        configurable: true,
        writable: true,
      });
    } catch {}
    return fn;
  };

  /** Define a getter that looks like the original accessor. */
  const defineGetter = (target, prop, value) => {
    try {
      Object.defineProperty(target, prop, {
        get: nativeize(() => value, "get " + prop),
        configurable: true,
        enumerable: false,
      });
    } catch {}
  };

  /* ---------- User-Agent + client hints ----------
   * Both are required: navigator.userAgent alone leaves userAgentData
   * reporting the real Windows platform, which contradicts the UA string. */
  defineGetter(Navigator.prototype, "userAgent", FP.ua);
  defineGetter(Navigator.prototype, "appVersion", FP.ua.replace(/^Mozilla\\//, ""));
  defineGetter(Navigator.prototype, "platform", "Linux armv8l");
  defineGetter(Navigator.prototype, "vendor", "Google Inc.");
  defineGetter(Navigator.prototype, "maxTouchPoints", 5);

  const HIGH_ENTROPY = {
    architecture: FP.uaData.architecture,
    bitness: FP.uaData.bitness,
    brands: FP.uaData.brands,
    mobile: FP.uaData.mobile,
    model: FP.uaData.model,
    platform: FP.uaData.platform,
    platformVersion: FP.uaData.platformVersion,
    uaFullVersion: FP.uaData.uaFullVersion,
    fullVersionList: FP.uaData.fullVersionList,
    wow64: false,
  };

  const uaData = Object.create(
    typeof NavigatorUAData !== "undefined" ? NavigatorUAData.prototype : Object.prototype
  );

  defineGetter(uaData, "brands", FP.uaData.brands);
  defineGetter(uaData, "mobile", FP.uaData.mobile);
  defineGetter(uaData, "platform", FP.uaData.platform);

  Object.defineProperty(uaData, "getHighEntropyValues", {
    value: nativeize(function getHighEntropyValues(hints) {
      const out = {};
      (hints || []).forEach((hint) => {
        if (hint in HIGH_ENTROPY) out[hint] = HIGH_ENTROPY[hint];
      });
      out.brands = FP.uaData.brands;
      out.mobile = FP.uaData.mobile;
      out.platform = FP.uaData.platform;
      return Promise.resolve(out);
    }, "getHighEntropyValues"),
    configurable: true,
    writable: true,
  });

  Object.defineProperty(uaData, "toJSON", {
    value: nativeize(function toJSON() {
      return {
        brands: FP.uaData.brands,
        mobile: FP.uaData.mobile,
        platform: FP.uaData.platform,
      };
    }, "toJSON"),
    configurable: true,
    writable: true,
  });

  defineGetter(Navigator.prototype, "userAgentData", uaData);

  /* ---------- Language ---------- */
  defineGetter(Navigator.prototype, "language", FP.lang);
  defineGetter(Navigator.prototype, "languages", Object.freeze(FP.langs.slice()));

  /* ---------- Hardware ---------- */
  defineGetter(Navigator.prototype, "hardwareConcurrency", FP.hardwareConcurrency);
  defineGetter(Navigator.prototype, "deviceMemory", FP.deviceMemory);

  /* ---------- Screen / viewport ----------
   * Reported in CSS pixels, matching how a real mobile Chrome reports a
   * device whose panel is FP.screen.w x FP.screen.h at FP.screen.dpr. */
  const S = FP.screen;
  defineGetter(Screen.prototype, "width", S.w);
  defineGetter(Screen.prototype, "height", S.h);
  defineGetter(Screen.prototype, "availWidth", S.availW);
  defineGetter(Screen.prototype, "availHeight", S.availH);
  defineGetter(Screen.prototype, "colorDepth", 24);
  defineGetter(Screen.prototype, "pixelDepth", 24);

  defineGetter(window, "devicePixelRatio", S.dpr);
  defineGetter(window, "outerWidth", S.w);
  defineGetter(window, "outerHeight", S.availH);
  defineGetter(window, "screenX", 0);
  defineGetter(window, "screenY", 0);
  defineGetter(window, "screenLeft", 0);
  defineGetter(window, "screenTop", 0);

  try {
    if (window.screen.orientation) {
      defineGetter(window.screen.orientation, "type", "portrait-primary");
      defineGetter(window.screen.orientation, "angle", 0);
    }
  } catch {}

  /* ---------- Timezone ----------
   * process.env.TZ is app-wide, so a per-profile timezone can only be done
   * here. Both Intl and the Date methods must agree, or the mismatch is
   * itself a fingerprint. */
  const TZ = FP.timezone;

  /** Captured before patching, so our own formatting never re-enters. */
  const OriginalDateTimeFormat = Intl.DateTimeFormat;

  /** Offset in minutes that Date.prototype.getTimezoneOffset should report. */
  const offsetFor = (date) => {
    try {
      const dtf = new OriginalDateTimeFormat("en-US", {
        timeZone: TZ,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      const parts = {};
      for (const part of dtf.formatToParts(date)) parts[part.type] = part.value;

      const asUTC = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour === "24" ? "0" : parts.hour),
        Number(parts.minute),
        Number(parts.second)
      );

      /* getTimezoneOffset is positive west of UTC, hence the negation. */
      return -Math.round((asUTC - date.getTime()) / 60000);
    } catch {
      return date.getTimezoneOffset();
    }
  };

  /** Formatters the caller gave an explicit timeZone — those report it as-is. */
  const explicitZone = new WeakMap();

  /** Intl.DateTimeFormat with our timezone as the default. */
  const PatchedDateTimeFormat = function DateTimeFormat(locales, options) {
    const opts = Object.assign({}, options);
    const hadZone = Boolean(opts.timeZone);
    if (!hadZone) opts.timeZone = TZ;

    const loc = locales === undefined ? FP.lang : locales;

    /* Called without new, Intl.DateTimeFormat still returns an instance. */
    const target = new OriginalDateTimeFormat(loc, opts);

    if (hadZone) {
      try {
        explicitZone.set(target, opts.timeZone);
      } catch {}
    }

    return target;
  };

  PatchedDateTimeFormat.prototype = OriginalDateTimeFormat.prototype;
  PatchedDateTimeFormat.supportedLocalesOf =
    OriginalDateTimeFormat.supportedLocalesOf.bind(OriginalDateTimeFormat);
  nativeize(PatchedDateTimeFormat, "DateTimeFormat");

  try {
    Intl.DateTimeFormat = PatchedDateTimeFormat;
  } catch {}

  /* resolvedOptions must report the spoofed zone.
   *
   * The real implementation always populates timeZone, so this has to
   * overwrite rather than fill in a blank — otherwise a formatter built
   * internally by the engine still reports the host machine's zone. */
  const originalResolvedOptions = OriginalDateTimeFormat.prototype.resolvedOptions;
  Object.defineProperty(OriginalDateTimeFormat.prototype, "resolvedOptions", {
    value: nativeize(function resolvedOptions() {
      const options = originalResolvedOptions.call(this);

      let requested = null;
      try {
        requested = explicitZone.get(this) || null;
      } catch {}

      options.timeZone = requested || TZ;
      return options;
    }, "resolvedOptions"),
    configurable: true,
    writable: true,
  });

  const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
  Object.defineProperty(Date.prototype, "getTimezoneOffset", {
    value: nativeize(function getTimezoneOffset() {
      return offsetFor(this);
    }, "getTimezoneOffset"),
    configurable: true,
    writable: true,
  });

  const originalToString = Date.prototype.toString;
  Object.defineProperty(Date.prototype, "toString", {
    value: nativeize(function toString() {
      if (Number.isNaN(this.getTime())) return "Invalid Date";

      try {
        const dtf = new OriginalDateTimeFormat("en-US", {
          timeZone: TZ,
          hour12: false,
          weekday: "short",
          month: "short",
          day: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          timeZoneName: "longOffset",
        });

        const parts = {};
        for (const part of dtf.formatToParts(this)) parts[part.type] = part.value;

        const offset = (parts.timeZoneName || "GMT+00:00").replace("GMT", "");
        const sign = offset.startsWith("-") ? "-" : "+";
        const digits = offset.replace(/[^0-9]/g, "").padStart(4, "0");

        const hour = parts.hour === "24" ? "00" : parts.hour;

        return (
          parts.weekday + " " + parts.month + " " + parts.day + " " +
          parts.year + " " + hour + ":" + parts.minute + ":" + parts.second +
          " GMT" + sign + digits
        );
      } catch {
        return originalToString.call(this);
      }
    }, "toString"),
    configurable: true,
    writable: true,
  });

  const originalToLocaleString = Date.prototype.toLocaleString;
  Object.defineProperty(Date.prototype, "toLocaleString", {
    value: nativeize(function toLocaleString(locales, options) {
      const opts = Object.assign({}, options);
      if (!opts.timeZone) opts.timeZone = TZ;
      return originalToLocaleString.call(this, locales === undefined ? FP.lang : locales, opts);
    }, "toLocaleString"),
    configurable: true,
    writable: true,
  });

  const originalToLocaleDateString = Date.prototype.toLocaleDateString;
  Object.defineProperty(Date.prototype, "toLocaleDateString", {
    value: nativeize(function toLocaleDateString(locales, options) {
      const opts = Object.assign({}, options);
      if (!opts.timeZone) opts.timeZone = TZ;
      return originalToLocaleDateString.call(this, locales === undefined ? FP.lang : locales, opts);
    }, "toLocaleDateString"),
    configurable: true,
    writable: true,
  });

  const originalToLocaleTimeString = Date.prototype.toLocaleTimeString;
  Object.defineProperty(Date.prototype, "toLocaleTimeString", {
    value: nativeize(function toLocaleTimeString(locales, options) {
      const opts = Object.assign({}, options);
      if (!opts.timeZone) opts.timeZone = TZ;
      return originalToLocaleTimeString.call(this, locales === undefined ? FP.lang : locales, opts);
    }, "toLocaleTimeString"),
    configurable: true,
    writable: true,
  });

  /* ---------- Touch ----------
   * A "mobile" client hint with no touch support is contradictory. */
  try {
    if (!("ontouchstart" in window)) {
      Object.defineProperty(window, "ontouchstart", {
        value: null,
        configurable: true,
        writable: true,
      });
    }
  } catch {}
})();
`;

/**
 * Write (or refresh) the per-profile spoof preload and return its path.
 *
 * @param {string} id profile id (partition)
 * @param {object} fingerprint
 * @returns {string|null} path to the generated script, or null on failure
 */
export const writeSpoofScript = (id, fingerprint) => {
  try {
    const dir = profileDir(id);
    fs.mkdirSync(dir, { recursive: true });

    const file = join(dir, "spoof.js");
    const source = TEMPLATE.replace(
      "__FINGERPRINT__",
      JSON.stringify(fingerprint)
    );

    /* Only rewrite when the content actually changed, so an unchanged profile
     * does not churn the file on every launch. */
    let existing = null;
    try {
      existing = fs.readFileSync(file, "utf8");
    } catch {
      existing = null;
    }

    if (existing !== source) {
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, source);
      fs.renameSync(tmp, file);
    }

    return file;
  } catch (e) {
    console.error("Failed to write spoof script:", e?.message ?? e);
    return null;
  }
};

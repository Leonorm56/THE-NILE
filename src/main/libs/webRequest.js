/**
 * Per-session rule storage.
 *
 * Electron's `session.webRequest.onBeforeSendHeaders` is a SETTER, not an
 * emitter — each call replaces the previously registered listener. Because
 * `Profile.configureProxy()` re-invokes `registerWebRequest(session)` without
 * rules on every proxy change, registering listeners eagerly would silently
 * discard the extension's header rules and leak the real desktop User-Agent.
 *
 * Rules therefore live here, keyed by Session, and listeners are installed
 * exactly once per session.
 *
 * @type {WeakMap<Electron.Session, chrome.declarativeNetRequest.Rule[]>}
 */
const sessionRules = new WeakMap();

/** @type {WeakSet<Electron.Session>} */
const listenersInstalled = new WeakSet();

/** Cap on in-flight request bookkeeping, as a backstop against leaks. */
const MAX_TRACKED_REQUESTS = 5000;

/** Response headers stripped so farmed pages can be embedded and read cross-origin. */
const STRIPPED_RESPONSE_HEADERS = [
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
  "cross-origin-embedder-policy",
  "cross-origin-opener-policy",
  "cross-origin-resource-policy",
  "access-control-allow-origin",
  "access-control-allow-credentials",
  "access-control-allow-methods",
  "access-control-allow-header",
  "access-control-allow-headers",
];

/** Electron resourceType → Chrome declarativeNetRequest resourceType. */
const RESOURCE_TYPE_MAP = {
  mainFrame: "main_frame",
  subFrame: "sub_frame",
  stylesheet: "stylesheet",
  script: "script",
  image: "image",
  font: "font",
  object: "object",
  xhr: "xmlhttprequest",
  ping: "ping",
  cspReport: "csp_report",
  media: "media",
  webSocket: "websocket",
  other: "other",
};

/**
 * Match a hostname against a Chrome `requestDomains` list.
 *
 * Chrome semantics: an absent list matches every domain, and a listed domain
 * also matches its subdomains. The previous implementation did exact-match
 * only and dereferenced the list unconditionally — which threw a TypeError on
 * the extension's global User-Agent rule (it carries `resourceTypes` but no
 * `requestDomains`), aborting the handler before `callback()` and taking all
 * header modification down with it.
 *
 * @param {string} hostname
 * @param {string[]|undefined} domains
 * @param {boolean} whenAbsent value to return when the list is absent/empty
 */
const matchesDomains = (hostname, domains, whenAbsent) => {
  if (!Array.isArray(domains) || domains.length === 0) return whenAbsent;

  return domains.some((domain) => {
    if (typeof domain !== "string" || domain === "") return false;
    const needle = domain.toLowerCase();
    return hostname === needle || hostname.endsWith(`.${needle}`);
  });
};

/**
 * Does a rule's condition apply to this request?
 *
 * @param {chrome.declarativeNetRequest.Rule} rule
 * @param {string} hostname
 * @param {string|undefined} resourceType Electron resourceType
 */
const ruleApplies = (rule, hostname, resourceType) => {
  const condition = rule?.condition;
  if (!condition) return false;

  /* Absent requestDomains means "all domains" in Chrome. */
  if (!matchesDomains(hostname, condition.requestDomains, true)) return false;

  /* Excluded domains win over included ones. */
  if (matchesDomains(hostname, condition.excludedRequestDomains, false)) {
    return false;
  }

  /* Honour resourceTypes when present and mappable. */
  if (Array.isArray(condition.resourceTypes) && condition.resourceTypes.length) {
    const mapped = RESOURCE_TYPE_MAP[resourceType];
    if (mapped && !condition.resourceTypes.includes(mapped)) return false;
  }

  if (
    Array.isArray(condition.excludedResourceTypes) &&
    condition.excludedResourceTypes.length
  ) {
    const mapped = RESOURCE_TYPE_MAP[resourceType];
    if (mapped && condition.excludedResourceTypes.includes(mapped)) return false;
  }

  return true;
};

/**
 * Apply a rule's header modifications in place.
 *
 * @param {Record<string, string>} headers
 * @param {Array<{header: string, operation: string, value?: string}>} modifications
 */
const applyHeaderModifications = (headers, modifications) => {
  if (!Array.isArray(modifications)) return;

  for (const modification of modifications) {
    const name = modification?.header;
    if (typeof name !== "string" || name === "") continue;

    switch (modification.operation) {
      case "set":
        headers[name] = modification.value;
        break;

      case "remove":
        /* Header names are case-insensitive; remove every casing variant. */
        for (const key of Object.keys(headers)) {
          if (key.toLowerCase() === name.toLowerCase()) delete headers[key];
        }
        break;

      case "append": {
        const existing = Object.keys(headers).find(
          (key) => key.toLowerCase() === name.toLowerCase()
        );
        if (existing && headers[existing]) {
          headers[existing] = `${headers[existing]}, ${modification.value}`;
        } else {
          headers[name] = modification.value;
        }
        break;
      }

      default:
        break;
    }
  }
};

/**
 * registerWebRequest
 *
 * Installs the header-rewriting listeners for a session, once. Safe to call
 * repeatedly.
 *
 * @param {Electron.Session} session
 * @param {chrome.declarativeNetRequest.Rule[]} [rules] When omitted, existing
 *   rules for this session are preserved. Pass an array to replace them.
 */
export const registerWebRequest = (session, rules) => {
  if (!session) return;

  /* Only replace rules when the caller actually supplied some. */
  if (Array.isArray(rules)) {
    sessionRules.set(session, rules);
  } else if (!sessionRules.has(session)) {
    sessionRules.set(session, []);
  }

  if (listenersInstalled.has(session)) return;
  listenersInstalled.add(session);

  /** In-flight CORS preflight bookkeeping, keyed by request id. */
  const requestMap = new Map();

  const forget = (id) => {
    requestMap.delete(id);
  };

  const currentRules = () => sessionRules.get(session) || [];

  /** onBeforeSendHeaders */
  session.webRequest.onBeforeSendHeaders(
    { urls: ["*://*/*", "ws://*/*", "wss://*/*"] },
    (details, callback) => {
      /* A throw here would never reach callback() and would stall the request
       * forever, so the whole body is guarded. */
      try {
        if (!/^(http|https|ws|wss):\/\//.test(details.url)) {
          return callback({ requestHeaders: details.requestHeaders });
        }

        const requestHeaders = details.requestHeaders || {};
        const hostname = new URL(details.url).hostname.toLowerCase();

        /* Modify Headers */
        for (const rule of currentRules()) {
          if (ruleApplies(rule, hostname, details.resourceType)) {
            applyHeaderModifications(
              requestHeaders,
              rule.action?.requestHeaders
            );
          }
        }

        /* Save Request Info for the CORS reflection below. */
        if (requestMap.size >= MAX_TRACKED_REQUESTS) requestMap.clear();
        requestMap.set(details.id, {
          origin: requestHeaders["Origin"],
          method: requestHeaders["Access-Control-Request-Method"],
          headers: requestHeaders["Access-Control-Request-Headers"],
        });

        return callback({ requestHeaders });
      } catch (e) {
        console.error("onBeforeSendHeaders failed:", e);
        return callback({ requestHeaders: details.requestHeaders });
      }
    }
  );

  /** onHeadersReceived */
  session.webRequest.onHeadersReceived(
    { urls: ["*://*/*", "ws://*/*", "wss://*/*"] },
    (details, callback) => {
      try {
        if (!/^(http|https|ws|wss):\/\//.test(details.url)) {
          return callback({ responseHeaders: details.responseHeaders });
        }

        let statusLine = details.statusLine;
        const hostname = new URL(details.url).hostname.toLowerCase();

        const responseHeaders = Object.fromEntries(
          Object.entries(details.responseHeaders || {}).filter(([key]) => {
            return !STRIPPED_RESPONSE_HEADERS.includes(key.toLowerCase());
          })
        );

        /* Modify Headers */
        for (const rule of currentRules()) {
          if (ruleApplies(rule, hostname, details.resourceType)) {
            applyHeaderModifications(
              responseHeaders,
              rule.action?.responseHeaders
            );
          }
        }

        if (details.method === "OPTIONS") {
          statusLine = "HTTP/1.1 200";
        }

        /** Reflect the preflight back so credentialed cross-origin calls pass. */
        const request = requestMap.get(details.id);

        responseHeaders["Access-Control-Allow-Credentials"] = "true";
        responseHeaders["Access-Control-Allow-Headers"] = request?.headers || "*";
        responseHeaders["Access-Control-Allow-Origin"] = request?.origin || "*";
        responseHeaders["Access-Control-Allow-Methods"] = request?.method || "*";

        return callback({ responseHeaders, statusLine });
      } catch (e) {
        console.error("onHeadersReceived failed:", e);
        return callback({ responseHeaders: details.responseHeaders });
      }
    }
  );

  /** Release per-request bookkeeping once the request settles. */
  session.webRequest.onCompleted({ urls: ["<all_urls>"] }, (details) => {
    forget(details.id);
  });

  session.webRequest.onErrorOccurred({ urls: ["<all_urls>"] }, (details) => {
    forget(details.id);
  });
};

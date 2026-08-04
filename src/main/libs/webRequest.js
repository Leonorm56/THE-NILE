/**
 * registerWebRequest
 * @param {Electron.Session} session
 * @param {chrome.declarativeNetRequest.Rule[]} rules
 * @returns
 */
export const registerWebRequest = (session, rules = []) => {
  const requestMap = new Map();

  /** onBeforeSendHeaders */
  session.webRequest.onBeforeSendHeaders(
    { urls: ["*://*/*", "ws://*/*", "wss://*/*"] },
    (details, callback) => {
      if (!/^(http|https|ws|wss):\/\//.test(details.url)) {
        return callback({ requestHeaders: details.requestHeaders });
      }

      /* Get Request Headers */
      const requestHeaders = details.requestHeaders || {};

      /* Modify Headers */
      for (const rule of rules) {
        if (
          rule.condition.requestDomains.includes(new URL(details.url).hostname)
        ) {
          for (const headerModification of rule.action.requestHeaders || []) {
            if (headerModification.operation === "set") {
              requestHeaders[headerModification.header] =
                headerModification.value;
            } else if (headerModification.operation === "remove") {
              delete requestHeaders[headerModification.header];
            }
          }
        }
      }

      /* Save Request Info */
      requestMap.set(details.id, {
        origin: requestHeaders["Origin"],
        method: requestHeaders["Access-Control-Request-Method"],
        headers: requestHeaders["Access-Control-Request-Headers"],
      });

      /* Return Headers */
      callback({ requestHeaders });
    }
  );

  /** onHeadersReceived */
  session.webRequest.onHeadersReceived(
    { urls: ["*://*/*", "ws://*/*", "wss://*/*"] },
    (details, callback) => {
      if (!/^(http|https|ws|wss):\/\//.test(details.url)) {
        return callback({ responseHeaders: details.responseHeaders });
      }

      /* Get Status Line */
      let statusLine = details.statusLine;

      /* Get Response Headers */
      const responseHeaders = Object.fromEntries(
        Object.entries(details.responseHeaders || {}).filter(([key]) => {
          return ![
            "x-frame-options",
            "content-security-policy",
            "cross-origin-embedder-policy",
            "cross-origin-opener-policy",
            "cross-origin-resource-policy",
            "access-control-allow-origin",
            "access-control-allow-credentials",
            "access-control-allow-methods",
            "access-control-allow-header",
          ].includes(key.toLowerCase());
        })
      );

      /* Modify Headers */
      for (const rule of rules) {
        if (
          rule.condition.requestDomains.includes(new URL(details.url).hostname)
        ) {
          for (const headerModification of rule.action.responseHeaders || []) {
            if (headerModification.operation === "set") {
              responseHeaders[headerModification.header] =
                headerModification.value;
            } else if (headerModification.operation === "remove") {
              delete responseHeaders[headerModification.header];
            }
          }
        }
      }

      try {
        if (details.method === "OPTIONS") {
          /** Set Status Code */
          statusLine = "HTTP/1.1 200";
        }

        /** Get Request */
        const request = requestMap.get(details.id);

        /** Credentials */
        responseHeaders["Access-Control-Allow-Credentials"] = "true";

        /** Headers */
        responseHeaders["Access-Control-Allow-Headers"] =
          request?.headers || "*";

        /** Origin */
        responseHeaders["Access-Control-Allow-Origin"] = request?.origin || "*";

        /** Methods */
        responseHeaders["Access-Control-Allow-Methods"] =
          request?.method || "*";
      } catch (e) {
        console.error(e);
      }

      /* Return Headers */
      callback({ responseHeaders, statusLine });
    }
  );
};

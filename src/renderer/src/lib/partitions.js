/** Configure Proxy */
export function configureProxy(partition, options) {
  return window.electron.ipcRenderer.invoke(
    "configure-proxy",
    partition,
    options
  );
}

/** Close Session */
export function closeSession(partition) {
  return window.electron.ipcRenderer.invoke("close-session", partition);
}

/** Get Whisker Data */
export function getWhiskerData({ account, settings }) {
  const {
    title,
    partition,
    proxyEnabled,
    proxyHost,
    proxyPort,
    proxyUsername,
    proxyPassword,
  } = account;

  const { theme, allowProxies } = settings;

  return {
    account: {
      title,
      partition,
    },
    sharedSettings: {
      theme,
      allowProxies,
      proxyEnabled,
      proxyHost,
      proxyPort,
      proxyUsername,
      proxyPassword,
    },
    settings: {},
  };
}

/**
 * Register Webview Message
 * @param {Electron.WebviewTag} webview
 */
export function registerWebviewMessage(webview, handlers) {
  /* Reply Function */
  const reply = (data) => {
    webview.send("host-message", data);
  };

  /* Listen for Messages */
  const listener = (event) => {
    if (event.channel === "webview-message") {
      const { action, data } = event.args[0];

      if (typeof handlers[action] === "function") {
        handlers[action](data, reply);
      }
    }
  };

  webview.addEventListener("ipc-message", listener);

  return listener;
}

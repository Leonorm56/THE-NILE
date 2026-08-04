import { app, session } from "electron";
import { join, resolve } from "path";
import { registerWebRequest } from "./libs/webRequest";
import { buildChromeContextMenu } from "electron-chrome-context-menu";
import isEqual from "fast-deep-equal";

import { loadProfileRecord } from "./libs/fingerprint";
import { writeSpoofScript } from "./libs/spoofScript";

/** Path to Preload File */
const PRELOAD_FILE = join(__dirname, "../preload/index.js");

/** Registration id of the generated per-profile fingerprint preload. */
const SPOOF_SCRIPT_ID = "fingerprint-spoof";

/** Profile Class */
class Profile {
  /** @type {string} */
  partition = "";

  /** @type {Electron.Session} */
  session = null;

  /** @type {Promise<void>} */
  readyPromise = null;

  /** @type {{proxyHost: string, proxyPort?: number, proxyUsername?: string, proxyPassword?: string}|null} */
  proxyOptions = null;

  /** Consecutive proxy auth challenges answered with the stored credentials.
   *
   * A proxy that rejects the credentials keeps re-issuing 407, and answering
   * it every time loops instead of surfacing anything. After the first retry
   * the auth is cancelled so the page fails with a visible proxy error. */
  proxyAuthFailures = 0;

  /** Persisted per-profile identity: { id, profilePath, fingerprint, proxy }
   * @type {object|null} */
  record = null;

  /** @param {string} partition */
  constructor(partition) {
    this.partition = partition;
    this.session = session.fromPartition(this.partition);

    this.handleLogin = this.handleLogin.bind(this);
    this.handleWebContentsCreated = this.handleWebContentsCreated.bind(this);
  }

  /** Destroy Profile */
  async destroy() {
    app.off("login", this.handleLogin);
    app.off("web-contents-created", this.handleWebContentsCreated);

    /** Unregister Preload Scripts */
    this.session.getPreloadScripts().then((scripts) => {
      scripts.forEach((script) => {
        this.session.unregisterPreloadScript(script.id);
      });
    });

    /* Remove Extensions */
    this.session.extensions.getAllExtensions().forEach((extension) => {
      this.session.extensions.removeExtension(extension.id);
    });

    /** Clear Proxy */
    await this.session.setProxy({ proxyRules: "" });

    /** Close All Connections */
    await this.session.closeAllConnections();
  }

  /** Initialize Profile */
  initialize() {
    if (!this.readyPromise) {
      this.readyPromise = this.configure();
    }

    return this.readyPromise;
  }

  /** Setup Preload Script */
  setupPreload() {
    this.session.getPreloadScripts().then((scripts) => {
      if (scripts.length === 0) {
        this.registerPreload();
      }
    });
  }

  /** Register Preload Script */
  registerPreload() {
    this.session.registerPreloadScript({
      filePath: PRELOAD_FILE,
      type: "frame",
      id: "preload-script",
    });
  }

  /**
   * Apply this profile's persisted device identity.
   *
   * Two halves, both required. session.setUserAgent covers the network-level
   * User-Agent header, but Chromium still reports the real platform through
   * client hints (navigator.userAgentData) — so a generated preload also
   * overrides the in-page surface. Timezone can only be done in the preload
   * at all: process.env.TZ is app-wide.
   *
   * @param {string} [country] proxy exit country, when known
   */
  applyFingerprint(country) {
    try {
      const proxy = this.proxyOptions
        ? {
            host: this.proxyOptions.proxyHost ?? null,
            port: this.proxyOptions.proxyPort ?? null,
            user: this.proxyOptions.proxyUsername ?? null,
            pass: this.proxyOptions.proxyPassword ?? null,
            country: country ?? this.proxyOptions.proxyCountry ?? null,
          }
        : country
          ? { country }
          : undefined;

      /* Generated once per profile id, then only ever read back. */
      this.record = loadProfileRecord(this.partition, proxy);

      const { fingerprint } = this.record;

      this.session.setUserAgent(fingerprint.ua, fingerprint.lang);

      const spoofFile = writeSpoofScript(this.partition, fingerprint);

      if (spoofFile) {
        /* This runs again on every proxy change, and registering an id that
         * already exists throws — so replace rather than add. */
        try {
          this.session.unregisterPreloadScript(SPOOF_SCRIPT_ID);
        } catch {
          /* Not registered yet: nothing to replace. */
        }

        this.session.registerPreloadScript({
          filePath: spoofFile,
          type: "frame",
          id: SPOOF_SCRIPT_ID,
        });
      }
    } catch (e) {
      console.error("Failed to apply fingerprint:", e?.message ?? e);
    }
  }

  /** Configure Proxy */
  async configureProxy(options) {
    try {
      if (options.allowProxies && options.proxyEnabled && options.proxyHost) {
        if (!this.proxyOptions || !isEqual(this.proxyOptions, options)) {
          /** Add credentials */
          this.proxyOptions = options;

          /* New endpoint or new credentials: let auth be attempted again. */
          this.proxyAuthFailures = 0;

          /** Proxy Rules
           *
           * No `,direct://` fallback. Chromium treats that as "use the proxy,
           * but fall back to a direct connection if it is unreachable or
           * refuses auth" — which quietly sends the account's traffic from the
           * real IP. For an account bound to a specific exit, failing closed
           * with ERR_PROXY_CONNECTION_FAILED is the safe outcome.
           *
           * A scheme on the host is honoured, so socks5:// proxies work;
           * a bare host:port stays HTTP, as Chromium defaults it. */
          const host = String(options.proxyHost).trim();
          const scheme = /^(socks5|socks4|https?):\/\//i.exec(host);
          const bare = scheme ? host.slice(scheme[0].length) : host;
          const port = options.proxyPort || 80;
          const proxyRules = `${scheme ? scheme[1].toLowerCase() + "://" : ""}${bare}:${port}`;

          /** Set Proxy */
          await this.session.setProxy({
            mode: "fixed_servers",
            proxyBypassRules: "<local>",
            proxyRules,
          });
        }
      } else {
        /** Clear Proxy */
        await this.session.setProxy({ proxyRules: "" });

        /** Remove Credentials */
        this.proxyOptions = null;
        this.proxyAuthFailures = 0;
      }
    } catch (e) {
      console.error(e);
    }

    /** Close All Connections */
    await this.session.closeAllConnections();

    /** Refresh the stored proxy details and, the first time a country is
     * known, align the timezone with it. The fingerprint itself is never
     * regenerated, so the timezone stays sticky even if the proxy drops. */
    this.applyFingerprint(options?.proxyCountry);

    /** Ensure the header-rewriting listeners exist for this session.
     *
     * Deliberately called without rules: this runs on every proxy change, and
     * the extension owns the rule set (installed via the
     * "update-declarative-net-rules" IPC). Passing an empty array here would
     * wipe those rules and leak the real desktop User-Agent to game APIs. */
    registerWebRequest(this.session);
  }

  /**
   * Handle Login
   * @param {Electron.Event} event
   * @param {Electron.WebContents} webContents
   * @param {Electron.AuthenticationResponseDetails} request
   * @param {Electron.AuthInfo} authInfo
   * @param {(username?: string, password?: string) => void} callback
   */
  handleLogin(event, webContents, request, authInfo, callback) {
    if (!authInfo?.isProxy) return;

    /* webContents is null for requests no frame owns (service worker,
     * net.request). Reading `.session` off it crashed the main process, and
     * there is nothing to attribute the request to either — every profile
     * listens on this one app-level event, so answering blind would hand this
     * profile's credentials to whichever proxy the request was actually for.
     * Leave it unclaimed. */
    if (!webContents) return;
    if (webContents.session !== this.session) return;
    if (this.proxyOptions === null) return;

    const { proxyUsername, proxyPassword } = this.proxyOptions;

    event.preventDefault();

    /* The same challenge coming back means the credentials were refused.
     * Cancel rather than answer again, so the failure reaches the page as a
     * proxy error instead of an endless auth loop. */
    if (this.proxyAuthFailures >= 2) {
      console.error(
        `Proxy rejected credentials for ${this.proxyOptions.proxyHost}:${this.proxyOptions.proxyPort} ` +
          `(user "${proxyUsername ?? ""}") — check the credentials, and whether the provider ` +
          `requires this machine's IP to be authorized.`
      );
      callback();
      return;
    }

    this.proxyAuthFailures += 1;
    callback(proxyUsername, proxyPassword);
  }

  /**
   * Handle WebContents Created
   * @param {object} _event
   * @param {Electron.WebContents} contents
   */
  handleWebContentsCreated(_event, contents) {
    if (contents.session !== this.session) return;

    /* Function to open link in new window */
    const openLink = (data) => {
      contents.hostWebContents.send("browser-message", {
        id: this.partition,
        action: "open-window",
        data,
      });
    };

    /* Context Menu for WebContents */
    contents.on("context-menu", (_e, params) => {
      const menu = buildChromeContextMenu({
        params,
        webContents: contents,
        openLink: (url) => openLink({ url }),
      });

      menu.popup();
    });

    /* Override window handler */
    contents.setWindowOpenHandler((details) => {
      if (
        ["default", "foreground-tab", "background-tab"].includes(
          details.disposition
        )
      ) {
        if (contents.hostWebContents) {
          openLink(details);
        } else {
          console.warn("No hostWebContents to send browser-message");
        }
        return { action: "deny" };
      } else {
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            autoHideMenuBar: true,
          },
        };
      }
    });
  }

  /** Setup event listeners */
  setupEventListeners() {
    app.on("login", this.handleLogin);
    app.on("web-contents-created", this.handleWebContentsCreated);
  }

  /** Configure Profile */
  async configure() {
    /** Apply the persisted device identity before anything loads. */
    this.applyFingerprint();

    /** Setup event listeners */
    this.setupEventListeners();
  }

  /** Get Extension */
  async getExtension(extensionPath) {
    let extension;

    if (extensionPath) {
      try {
        /** Get Loaded Extension */
        extension = this.session.extensions
          .getAllExtensions()
          .find((item) => resolve(item.path) === resolve(extensionPath));

        /** Load Extension */
        if (!extension) {
          extension = await this.session.extensions.loadExtension(
            extensionPath,
            { allowFileAccess: true }
          );
        }
      } catch (e) {
        console.error(e);
      }
    }
    return { extension, preload: "file://" + PRELOAD_FILE };
  }
}

export default Profile;

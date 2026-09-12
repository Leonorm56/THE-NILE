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

          /** Proxy Rules */
          const proxyRules = `${options.proxyHost}:${options.proxyPort || 80},direct://`;

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

    /** Configure Web Request */
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
    // webContents is null for auth requests that do not originate from a
    // frame (e.g. extension service-worker traffic). They can't be matched
    // to a profile session, so ignore them instead of crashing on `.session`.
    if (!webContents || webContents.isDestroyed()) return;

    if (
      webContents.session === this.session &&
      authInfo.isProxy &&
      this.proxyOptions !== null
    ) {
      const { proxyUsername, proxyPassword } = this.proxyOptions;

      event.preventDefault();
      callback(proxyUsername, proxyPassword);
    }
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

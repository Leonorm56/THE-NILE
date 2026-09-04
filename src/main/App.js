import {
  BrowserWindow,
  app,
  ipcMain,
  screen,
  shell,
  Notification,
  dialog,
  session,
  nativeTheme,
} from "electron";
import { Conf } from "electron-conf/main";
import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import { join } from "path";

import icon from "../../resources/icon.png?asset";
import { startMirrorServer, stopMirrorServer } from "./server";

import axios from "axios";
import fs from "fs/promises";
import semver from "semver";

import { buildChromeContextMenu } from "electron-chrome-context-menu";
import { downloadAndExtract, extractZip } from "./libs/downloader";
import Profile from "./Profile";
import { registerWebRequest } from "./libs/webRequest";
import { removeProfileRecord } from "./libs/fingerprint";

/**
 * Profile Map
 * @type {Map<string, Profile>}
 */
const profileMap = new Map();

class App {
  constructor() {
    this.initialize();
  }

  async createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    // Create the browser window.
    this.window = new BrowserWindow({
      width,
      height,
      show: false,
      autoHideMenuBar: true,
      ...(process.platform === "linux" ? { icon } : {}),
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        sandbox: false,
        webviewTag: true,
        webSecurity: false,
      },
    });

    /* Context Menu for WebContents */
    this.window.webContents.on("context-menu", (_e, params) => {
      const menu = buildChromeContextMenu({
        params,
        webContents: this.window.webContents,
        openLink: (url) => {
          shell.openExternal(url);
        },
      });

      menu.popup();
    });

    /* Maximize when ready to show */
    this.window.on("ready-to-show", async () => {
      this.window.maximize();
    });

    /* Handle links opening in external browser */
    this.window.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return { action: "deny" };
    });

    // HMR for renderer base on electron-vite cli.
    // Load the remote URL for development or the local html file for production.
    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      this.window.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    } else {
      this.window.loadFile(join(__dirname, "../renderer/index.html"));
    }
  }

  /** Register IPC Handlers */
  registerIpcHandlers() {
    ipcMain.handle("get-app-version", this.getAppVersion.bind(this));
    ipcMain.handle("get-session-cookie", this.getSessionCookie.bind(this));
    ipcMain.handle("set-session-cookie", this.setSessionCookie.bind(this));
    ipcMain.handle(
      "update-declarative-net-rules",
      this.updateDeclarativeNetRules.bind(this)
    );
    ipcMain.handle("save-backup-file", this.saveBackupFile.bind(this));
    ipcMain.handle("open-path", this.openPath.bind(this));
    ipcMain.handle("install-extension", this.installExtension.bind(this));
    ipcMain.handle("update-extension", this.updateExtension.bind(this));
    ipcMain.handle(
      "get-extension-version",
      this.getExtensionVersion.bind(this)
    );
    ipcMain.handle(
      "get-default-extension-path",
      this.getDefaultExtensionPath.bind(this)
    );
    ipcMain.handle("pick-extension-path", this.pickExtensionPath.bind(this));
    ipcMain.handle("configure-proxy", this.configureProxy.bind(this));
    ipcMain.handle("setup-session", this.setupSession.bind(this));
    ipcMain.handle("remove-session", this.removeSession.bind(this));
    ipcMain.handle("configure-theme", this.configureTheme.bind(this));
    ipcMain.handle("nile-wallet", this.handleNileWallet.bind(this));
  }


  /** Forward nile-wallet message to extension service worker in profile session */
  async handleNileWallet(event, partition, action, payload) {
    try {
      let target;
      if (partition) {
        const ses = session.fromPartition(partition);
        const allWc = require("electron").webContents.getAllWebContents();
        target = allWc.find(wc => wc.session === ses && !wc.isDestroyed());
      } else {
        // No partition - find any non-main-frame webview
        const allWc = require("electron").webContents.getAllWebContents();
        target = allWc.find(wc => !wc.isDestroyed() && !wc.isMainFrame());
      }
      if (!target) {
        target = event.sender;
      }
      // Use window.postMessage bridge: the isolated content script listens
      // for nile-wallet-request messages and forwards to chrome.runtime.sendMessage
      const msgId = "nw-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
      const bridgeScript = 'new Promise((res,rej)=>{var t=setTimeout(()=>rej(new Error("bridge-timeout")),15000);window.addEventListener("message",function h(ev){if(ev.source!==window||ev.data?.type!=="nile-wallet-response"||ev.data?.id!=="' + msgId + '")return;window.removeEventListener("message",h);clearTimeout(t);res(ev.data.result)});window.postMessage({type:"nile-wallet-request",id:"' + msgId + '",action:' + JSON.stringify(action) + ',payload:' + JSON.stringify(payload || {}) + '},"*")})';
      return await target.executeJavaScript(bridgeScript);
    } catch(e) { return { ok: false, error: e.message }; }
  }

  /** Get App Version */
  getAppVersion() {
    return app.getVersion();
  }

  /** Get Session Cookie */
  getSessionCookie(event, options) {
    return event.sender.session.cookies.get(options);
  }

  /** Set Session Cookie */
  setSessionCookie(event, options) {
    return event.sender.session.cookies.set(options);
  }

  /** Save Backup File */
  async saveBackupFile(_event, filename, content) {
    /** Backup Directory */
    const backupDir = join(
      app.getPath("documents"),
      "THE NILE Backup"
    );

    /** Full Backup File Path */
    const backupFile = join(backupDir, filename);

    /** Ensure backup directory exists */
    await fs.mkdir(backupDir, { recursive: true });

    /** Write to Backup */
    await fs.writeFile(backupFile, content);

    /** Show Backup File */
    shell.showItemInFolder(backupFile);
  }

  /** Open Path */
  async openPath(_event, path) {
    shell.openPath(path);
  }

  /** Install Extension */
  async installExtension(_event, file, path) {
    await extractZip(file, path);
  }

  /** Get Default Extension Path */
  async getDefaultExtensionPath(_event) {
    return join(app.getPath("userData"), "Extension");
  }

  /** Pick Extension Path */
  async pickExtensionPath(_event, defaultPath) {
    return await dialog.showOpenDialog({
      defaultPath,
      properties: ["openDirectory"],
    });
  }

  /** Get Extension Version */
  async getExtensionVersion(_event, path) {
    const manifestPath = join(path, "manifest.json");

    try {
      /** Check if manifest.json exists by trying to access it */
      await fs.access(manifestPath);

      /** Read and parse manifest.json */
      const manifestContent = await fs.readFile(manifestPath, "utf8");
      const manifest = JSON.parse(manifestContent);

      return "v" + manifest.version;
    } catch (error) {
      console.error("Error reading manifest.json:", error.message);
      return null;
    }
  }

  /** Update Extension */
  async updateExtension(_event, path) {
    try {
      /* Get Current Extension Version */
      const currentExtensionVersion = await this.getExtensionVersion(
        _event,
        path
      );

      /* Fetch Latest Release Info */
      const latestRelease = await axios
        .get(import.meta.env.VITE_EXTENSION_RELEASE_API_URL)
        .then((res) => res.data);

      /* Get Latest Tag */
      const latestTag = latestRelease["tag_name"];

      /* Compare Versions and Update if Needed */
      if (
        currentExtensionVersion === null ||
        semver.gt(latestTag, currentExtensionVersion)
      ) {
        /* Find Release File */
        const filePattern = new RegExp(
          import.meta.env.VITE_EXTENSION_RELEASE_FILE_PATTERN.replaceAll(
            "*",
            "\\d+"
          ).replaceAll(".", "\\.")
        );

        /* Get Release File */
        const releaseFile = latestRelease.assets.find((item) =>
          filePattern.test(item.name)
        );

        if (releaseFile) {
          /* Download and Extract */
          await downloadAndExtract(releaseFile["browser_download_url"], path);

          /* Show Notification */
          new Notification({
            title: "Extension Updated",
            body: `A new version of the extension has been installed - ${latestTag}.`,
          }).show();

          return {
            status: true,
            version: latestTag,
          };
        }
      }
    } catch (e) {
      console.error("Failed to check for extension update:", e.message);
    }

    return {
      status: false,
    };
  }

  /** Install Extension */
  async installExtension(_event, file, path) {
    await extractZip(file, path);
  }

  /** Get session */
  getSession(partition) {
    return session.fromPartition(partition);
  }

  /** Get Profile */
  getProfile(partition) {
    if (!profileMap.has(partition)) {
      const profile = new Profile(partition);
      profileMap.set(partition, profile);
    }

    return profileMap.get(partition);
  }

  /** Setup Session */
  async setupSession(_event, data) {
    const profile = this.getProfile(data.partition);

    /** Initialize Profile */
    await profile.initialize();

    /** Configure Proxy */
    if (data.proxyOptions) {
      await profile.configureProxy(data.proxyOptions);
    }

    /** Load Extension */
    return profile.getExtension(data.extensionPath);
  }

  /** Configure Proxy */
  async configureProxy(_event, partition, options) {
    const profile = this.getProfile(partition);

    /** Initialize Profile */
    await profile.initialize();

    /** Configure Proxy */
    return profile.configureProxy(options);
  }

  /** Update Declarative Net Rules
   * @param {Electron.IpcMainInvokeEvent} event
   * @param {Array} rules
   */
  updateDeclarativeNetRules(event, rules) {
    registerWebRequest(event.sender.session, rules);
  }

  /** Configure Theme
   * @param {Electron.IpcMainInvokeEvent} event
   * @param {string} theme
   */
  configureTheme(_event, theme) {
    nativeTheme.themeSource = theme;
  }

  /** Remove Session */
  async removeSession(_event, partition) {
    /* Destroy Profile */
    if (profileMap.has(partition)) {
      await profileMap.get(partition).destroy();
      profileMap.delete(partition);
    }

    /* Get Session */
    const ses = this.getSession(partition);

    /* Clear all session data before removing */
    await ses.clearCache();
    await ses.clearStorageData();

    /* Get Storage Path */
    const storagePath = ses.getStoragePath();

    /** Remove Partition */
    await fs.rm(storagePath, { recursive: true, force: true });

    /** Remove the persisted fingerprint and generated spoof script. */
    removeProfileRecord(partition);
  }

  initialize() {
    // This method will be called when Electron has finished
    // initialization and is ready to create browser windows.
    // Some APIs can only be used after this event occurs.
    app.whenReady().then(async () => {
      // Set app user model id for windows
      electronApp.setAppUserModelId("THE NILE");

      // Default open or close DevTools by F12 in development
      // and ignore CommandOrControl + R in production.
      // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
      app.on("browser-window-created", (_, window) => {
        optimizer.watchWindowShortcuts(window);
      });

      // Start Mirror Server. Never let this block startup: the port may be
      // taken by another app, and a missing mirror must not stop the window.
      try {
        await this.startMirrorServer();
      } catch (e) {
        console.error("Mirror server unavailable:", e?.message ?? e);
      }

      // Register conf listener
      this.setupConfig();

      // Handles
      this.registerIpcHandlers();

      // Create Window
      this.createWindow();

      app.on("activate", () => {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) this.createWindow();
      });
    });

    // Quit when all windows are closed, except on macOS. There, it's common
    // for applications and their menu bar to stay active until the user quits
    // explicitly with Cmd + Q.
    app.on("window-all-closed", async () => {
      if (process.platform !== "darwin") {
        await stopMirrorServer();
        app.quit();
      }
    });

    // In this file you can include the rest of your app's specific main process
    // code. You can also put them in separate files and require them here.
  }

  async startMirrorServer() {
    await startMirrorServer();
  }

  setupConfig() {
    new Conf().registerRendererListener();
  }
}

export default App;

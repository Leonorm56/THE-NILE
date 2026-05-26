import {
  configureProxy,
  getWhiskerData,
  registerWebviewMessage,
} from "../lib/partitions";
import { useCallback, useRef } from "react";

import useSettingsStore from "../store/useSettingsStore";

const TELEGRAM_WEB_URL = "https://web.telegram.org/k/";

export default function useBackupAndRestore() {
  const containerRef = useRef();
  const theme = useSettingsStore((state) => state.theme);
  const allowProxies = useSettingsStore((state) => state.allowProxies);
  const extensionPath = useSettingsStore((state) => state.extensionPath);

  /** Get or Restore Account Backup */
  const getOrRestoreAccountBackup = useCallback(
    (account, backup = null) =>
      new Promise(async (resolve, reject) => {
        const {
          partition,
          proxyEnabled,
          proxyHost,
          proxyPort,
          proxyUsername,
          proxyPassword,
        } = account;

        /** Configure Proxy */
        await configureProxy(partition, {
          allowProxies,
          proxyEnabled,
          proxyHost,
          proxyPort,
          proxyUsername,
          proxyPassword,
        });

        let webview;
        const container = containerRef.current;

        /** Overall timeout */
        const overallTimeout = setTimeout(() => {
          webview?.remove();
          reject(new Error("Backup/restore operation timed out"));
        }, 180000);

        /** Navigate webview and wait for page load */
        const navigate = (url) =>
          new Promise((res, rej) => {
            const timeout = setTimeout(() => {
              webview?.removeEventListener("did-finish-load", onLoad);
              webview?.removeEventListener("did-fail-load", onFail);
              rej(new Error("Navigation timeout"));
            }, 45000);

            const onLoad = () => {
              clearTimeout(timeout);
              webview?.removeEventListener("did-fail-load", onFail);
              res();
            };

            const onFail = (e) => {
              clearTimeout(timeout);
              webview?.removeEventListener("did-finish-load", onLoad);
              rej(new Error(`Navigation failed: ${e.errorDescription || e.errorCode}`));
            };

            webview?.addEventListener("did-finish-load", onLoad);
            webview?.addEventListener("did-fail-load", onFail);
            webview.src = url;
          });

        /** Create webview */
        webview = document.createElement("webview");
        webview.setAttribute("partition", partition);
        webview.setAttribute("allowpopups", "true");
        webview.setAttribute("class", "w-full h-full opacity-0 fixed");

        /** Set up session and load extension */
        const { extension, preload } = await window.electron.ipcRenderer
          .invoke("setup-session", {
            partition,
            extensionPath,
          })
          .catch(() => ({ extension: null, preload: null }));

        const extensionUrl = extension
          ? extension.url + "index.html"
          : import.meta.env.VITE_DEFAULT_WEBVIEW_URL;

        webview.preload = preload;

        /** Append to container */
        container.appendChild(webview);

        /** Send Host Message */
        const sendHostMessage = (data) => {
          webview.send("host-message", data);
        };

        if (backup) {
          /** === RESTORE FLOW === */

          /** Register webview message handler */
          registerWebviewMessage(webview, {
            "get-whisker-data": (_data, reply) => {
              reply({
                action: "set-whisker-data",
                data: getWhiskerData({
                  account,
                  settings: {
                    allowProxies,
                    theme,
                  },
                }),
              });

              /** Send restore command for chrome storage only */
              sendHostMessage({
                action: "restore-backup-data",
                data: backup,
              });
            },
            "response-restore-backup-data": (data) => {
              clearTimeout(overallTimeout);
              webview.remove();
              resolve(data);
            },
            "set-proxy": (data) => {
              configureProxy(partition, {
                ...data,
                allowProxies,
              });
            },
          });

          /** Step 1: Navigate to Telegram Web to set localStorage */
          await navigate(TELEGRAM_WEB_URL);

          if (backup?.data?.telegramWebLocalStorage) {
            await webview.executeJavaScript(
              `(() => {
                const items = ${JSON.stringify(backup.data.telegramWebLocalStorage)};
                localStorage.clear();
                Object.entries(items).forEach(([k, v]) => localStorage.setItem(k, v));
                return true;
              })()`,
            );
          }

          /** Step 2: Navigate to extension for chrome storage restore */
          await navigate(extensionUrl);
        } else {
          /** === BACKUP FLOW === */

          let chromeData;

          /** Register webview message handler */
          registerWebviewMessage(webview, {
            "get-whisker-data": (_data, reply) => {
              reply({
                action: "set-whisker-data",
                data: getWhiskerData({
                  account,
                  settings: {
                    allowProxies,
                    theme,
                  },
                }),
              });

              /** Request for Backup Data */
              sendHostMessage({
                action: "get-backup-data",
              });
            },
            "response-get-backup-data": async (data) => {
              try {
                chromeData = data;

                /** Navigate to Telegram Web to get localStorage */
                await navigate(TELEGRAM_WEB_URL);

                const telegramWebLocalStorage =
                  await webview.executeJavaScript(
                    `(() => {
                      const items = {};
                      for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        items[key] = localStorage.getItem(key);
                      }
                      return items;
                    })()`,
                  );

                /** Combine chrome storage with Telegram Web localStorage */
                const result = {
                  ...chromeData,
                  data: {
                    ...chromeData.data,
                    telegramWebLocalStorage,
                  },
                };

                clearTimeout(overallTimeout);
                webview.remove();
                resolve(result);
              } catch (e) {
                clearTimeout(overallTimeout);
                webview.remove();
                reject(e);
              }
            },
            "set-proxy": (data) => {
              configureProxy(partition, {
                ...data,
                allowProxies,
              });
            },
          });

          /** Navigate to extension */
          await navigate(extensionUrl);
        }
      }),
    [theme, allowProxies, extensionPath],
  );

  return {
    containerRef,
    getOrRestoreAccountBackup,
  };
}

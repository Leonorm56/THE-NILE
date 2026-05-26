import {
  configureProxy,
} from "../lib/partitions";
import { useCallback, useRef } from "react";

import useSettingsStore from "../store/useSettingsStore";

const TELEGRAM_WEB_URL = "https://web.telegram.org/k/";
const BACKUP_TIMEOUT = 180000;
const NAV_TIMEOUT = 45000;

export default function useBackupAndRestore() {
  const containerRef = useRef();
  const allowProxies = useSettingsStore((state) => state.allowProxies);
  const extensionPath = useSettingsStore((state) => state.extensionPath);

  const getOrRestoreAccountBackup = useCallback(
    (account, backup = null) =>
      new Promise((resolve, reject) => {
        const {
          partition,
          proxyEnabled,
          proxyHost,
          proxyPort,
          proxyUsername,
          proxyPassword,
        } = account;

        const run = async () => {
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

          const overallTimeout = setTimeout(() => {
            webview?.remove();
            reject(new Error("Backup/restore operation timed out"));
          }, BACKUP_TIMEOUT);

          const navigate = (url) =>
            new Promise((res, rej) => {
              const timeout = setTimeout(() => {
                webview?.removeEventListener("did-stop-loading", onStop);
                webview?.removeEventListener("did-fail-load", onFail);
                rej(new Error("Navigation timeout"));
              }, NAV_TIMEOUT);

              const onStop = () => {
                clearTimeout(timeout);
                webview?.removeEventListener("did-fail-load", onFail);
                res();
              };

              const onFail = (e) => {
                clearTimeout(timeout);
                webview?.removeEventListener("did-stop-loading", onStop);
                rej(new Error(`Navigation failed: ${e.errorDescription || e.errorCode}`));
              };

              webview?.addEventListener("did-stop-loading", onStop);
              webview?.addEventListener("did-fail-load", onFail);
              webview.src = url;
            });

          try {
            webview = document.createElement("webview");
            webview.setAttribute("partition", partition);
            webview.setAttribute("allowpopups", "true");
            webview.setAttribute("class", "w-full h-full opacity-0 fixed");

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
            container.appendChild(webview);

            if (backup) {
              /** === RESTORE FLOW === */
              try {
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
              } catch (e) {
                console.warn("Telegram Web step failed, continuing:", e.message);
              }

              clearTimeout(overallTimeout);
              webview.remove();
              resolve(true);
            } else {
              /** === BACKUP FLOW === */
              await navigate(extensionUrl);

              const chromeResult = await webview.executeJavaScript(
                `(() => {
                  try {
                    return new Promise((resolve) => {
                      chrome.storage.local.get(null, (items) => resolve(items));
                    });
                  } catch(e) {
                    return 'ERR: ' + e.message;
                  }
                })()`,
              );

              if (typeof chromeResult === "string" && chromeResult.startsWith("ERR:")) {
                throw new Error("chrome.storage backup error: " + chromeResult);
              }

              const chromeLocalStorage = chromeResult;

              await navigate(TELEGRAM_WEB_URL);

              const telegramWebLocalStorage = await webview.executeJavaScript(
                `(() => {
                  const items = {};
                  for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    items[key] = localStorage.getItem(key);
                  }
                  return items;
                })()`,
              );

              const result = {
                version: import.meta.env.__APP_PACKAGE_VERSION__ || "0.0.0",
                time: Date.now(),
                data: {
                  chromeLocalStorage,
                  telegramWebLocalStorage,
                },
              };

              clearTimeout(overallTimeout);
              webview.remove();
              resolve(result);
            }
          } catch (err) {
            clearTimeout(overallTimeout);
            webview?.remove();
            reject(err);
          }
        };

        run();
      }),
    [allowProxies, extensionPath],
  );

  return {
    containerRef,
    getOrRestoreAccountBackup,
  };
}

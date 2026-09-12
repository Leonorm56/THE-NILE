import {
  configureProxy,
  getWhiskerData,
  registerWebviewMessage,
} from "../lib/partitions";
import { useCallback, useRef } from "react";

import { createWebview } from "../lib/utils";
import useSettingsStore from "../store/useSettingsStore";

const BACKUP_TIMEOUT_MS = 60 * 1000;

export default function useBackupAndRestore() {
  const containerRef = useRef();
  const theme = useSettingsStore((state) => state.theme);
  const allowProxies = useSettingsStore((state) => state.allowProxies);
  const extensionPath = useSettingsStore((state) => state.extensionPath);

  /** Get or restore an account backup through the extension. */
  const getOrRestoreAccountBackup = useCallback(
    (account, backup = null) =>
      new Promise((resolve, reject) => {
        if (!account?.partition) {
          reject(new Error("The backup does not contain a valid account."));
          return;
        }

        const {
          partition,
          proxyEnabled,
          proxyHost,
          proxyPort,
          proxyUsername,
          proxyPassword,
        } = account;
        const container =
          document.getElementById("webviews-container") || containerRef.current;

        if (!container) {
          reject(new Error("Unable to create the backup webview container."));
          return;
        }

        let webview;
        let timeout;
        let settled = false;

        const cleanup = () => {
          clearTimeout(timeout);
          webview?.remove();
        };
        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
          cleanup();
          callback(value);
        };

        const initializeWebview = async () => {
          try {
            await configureProxy(partition, {
              allowProxies,
              proxyEnabled,
              proxyHost,
              proxyPort,
              proxyUsername,
              proxyPassword,
            });

            webview = createWebview(partition, extensionPath);
            const sendHostMessage = (data) =>
              webview.send("host-message", data);
            const handleResponse = (data) => finish(resolve, data);

            registerWebviewMessage(webview, {
              "get-whisker-data": () => {
                sendHostMessage({
                  action: "set-whisker-data",
                  data: getWhiskerData({
                    account,
                    settings: { allowProxies, theme },
                  }),
                });
                sendHostMessage(
                  backup
                    ? { action: "restore-backup-data", data: backup }
                    : { action: "get-backup-data" },
                );
              },
              "set-proxy": (data) => {
                configureProxy(partition, { ...data, allowProxies }).catch(
                  (error) => console.error("Failed to update proxy:", error),
                );
              },
              "response-get-backup-data": handleResponse,
              "response-restore-backup-data": handleResponse,
            });

            container.appendChild(webview);
          } catch (error) {
            finish(reject, error);
          }
        };

        timeout = setTimeout(() => {
          finish(
            reject,
            new Error(
              "The extension did not respond while processing the backup.",
            ),
          );
        }, BACKUP_TIMEOUT_MS);

        initializeWebview();
      }),
    [theme, allowProxies, extensionPath],
  );

  return { containerRef, getOrRestoreAccountBackup };
}

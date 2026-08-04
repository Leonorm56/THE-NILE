import {
  configureProxy,
  getWhiskerData,
  registerWebviewMessage,
} from "../lib/partitions";
import { useCallback, useRef } from "react";

import { createWebview } from "../lib/utils";
import useSettingsStore from "../store/useSettingsStore";

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

        let interval, webview;
        const container = containerRef.current;
        const initializeWebview = () => {
          webview?.remove();
          webview = createWebview(partition, extensionPath);

          /** Send Host Message */
          const sendHostMessage = (data) => {
            webview.send("host-message", data);
          };

          /** Handle Response */
          const handleResponse = (data) => {
            webview.remove();
            clearInterval(interval);
            resolve(data);
          };

          /** Register Webview Message */
          registerWebviewMessage(webview, {
            "get-whisker-data": () => {
              /** Send Whisker Data */
              sendHostMessage({
                action: "set-whisker-data",
                data: getWhiskerData({
                  account,
                  settings: {
                    allowProxies,
                    theme,
                  },
                }),
              });

              if (backup) {
                /** Restore Backup Data */
                sendHostMessage({
                  action: "restore-backup-data",
                  data: backup,
                });
              } else {
                /** Request for Backup Data */
                sendHostMessage({
                  action: "get-backup-data",
                });
              }
            },
            "set-proxy": (data) => {
              configureProxy(partition, {
                ...data,
                allowProxies,
              });
            },
            "response-get-backup-data": handleResponse,
            "response-restore-backup-data": handleResponse,
          });

          /** Append to container */
          container.appendChild(webview);
        };

        /** Set Interval */
        interval = setInterval(initializeWebview, 30 * 1000);

        /** Initialize */
        initializeWebview();
      }),
    [theme, allowProxies, extensionPath],
  );

  return {
    containerRef,
    getOrRestoreAccountBackup,
  };
}

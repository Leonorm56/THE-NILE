import { getWhiskerData, registerWebviewMessage } from "../lib/partitions";
import { useCallback, useRef, useState } from "react";

import Spider from "../lib/Spider";
import { createWebview } from "../lib/utils";
import socket from "../lib/mirror";
import toast from "react-hot-toast";
import useAppStore from "../store/useAppStore";
import { useMutation } from "@tanstack/react-query";
import { useProgress } from "../hooks/useProgress";
import useSettingsStore from "../store/useSettingsStore";
import { uuid } from "../lib/utils";

const useSpiderAccountsForm = ({ country }) => {
  const containerRef = useRef();

  const spiderApiKey = useAppStore((state) => state.spiderApiKey);
  const addAccount = useAppStore((state) => state.addAccount);
  const launchAccount = useAppStore((state) => state.launchAccount);

  const extensionPath = useSettingsStore((state) => state.extensionPath);

  const [count, setCount] = useState(1);
  const [batch, setBatch] = useState(1);
  const [password, setPassword] = useState("");
  const [enableLocalTelegramSession, setEnableLocalTelegramSession] =
    useState(true);

  const { progress, resetProgress, incrementProgress } = useProgress();

  /** Calculate Total Price */
  const totalPrice = country ? (count * country.price).toFixed(2) : 0;

  /** Restore account backup */
  const restoreAccountBackup = useCallback(
    (account, backup = null) =>
      new Promise(async (resolve, reject) => {
        const { partition } = account;

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
                  settings: {},
                }),
              });

              /** Restore Backup Data */
              sendHostMessage({
                action: "restore-backup-data",
                data: backup,
              });
            },

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
    [extensionPath],
  );

  const mutation = useMutation({
    mutationKey: ["purchase-spider-accounts", spiderApiKey, country?.code],
    mutationFn: async ({
      count = 1,
      batch = 1,
      twoFA = "",
      enableLocalTelegramSession = true,
    }) => {
      resetProgress();

      const spider = new Spider(spiderApiKey);
      const results = [];

      console.log("Starting purchase of accounts:", count);
      console.log("Purchasing in batch:", batch);
      console.log("Using 2FA password:", twoFA);

      for (let i = 0; i < count; i += batch) {
        const chunk = Array.from(
          { length: Math.min(batch, count - i) },
          async () => {
            try {
              const purchase = await spider.purchaseAccount({
                countryCode: country.code,
                enableLocalTelegramSession,
                twoFA,
              });

              /* Validate Purchae */
              if (!purchase.success) {
                throw new Error(
                  purchase.error || "Unknown error purchasing account",
                );
              }

              /* Log Purchase */
              console.log("Purchased account from Spider:", purchase);

              const { account, localTelegramSession, telegramWebLocalStorage } =
                purchase;

              /* Prepare New Whiskers Account */
              const partition = `persist:${uuid()}`;
              const newWhiskersAccount = {
                partition,
                title: `Spider ${account["phone"]}`,
              };

              /* Store Account */
              addAccount(newWhiskersAccount);

              /* Log Restoring Backup */
              console.log("Restoring backup for account:", newWhiskersAccount);

              try {
                /* Prepare Chrome Local Storage */
                const chromeLocalStorage = {
                  "shared:accounts": [
                    {
                      id: "default",
                      partition: partition,
                      title: newWhiskersAccount.title,
                    },
                  ],
                };

                /* Store Local Telegram Session if Enabled */
                if (enableLocalTelegramSession) {
                  chromeLocalStorage["account-default:local-telegram-session"] =
                    localTelegramSession;

                  chromeLocalStorage["account-default:settings"] = {
                    farmerMode: "session",
                    onboarded: true,
                  };
                }

                /* Prepare Backup Data */
                const backupData = {
                  data: {
                    telegramWebLocalStorage,
                    chromeLocalStorage,
                  },
                };

                /* Log Backup Data */
                console.log("Backup data to restore:", backupData);

                /* Restore Backup */
                await restoreAccountBackup(newWhiskersAccount, backupData);

                /* Launch Account */
                launchAccount(partition);

                /* Wait a moment to ensure data is written */
                await toast.promise(
                  new Promise((res) => setTimeout(res, 2000)).then(() =>
                    /* Set active tab to telegram-web-k */
                    socket.send({
                      action: "core.set-active-tab",
                      data: ["telegram-web-k"],
                    }),
                  ),
                  {
                    loading: "Finalizing account setup...",
                    success: "Account setup finalized!",
                    error: "Error finalizing account setup.",
                  },
                );
              } catch (e) {
                console.error("Error restoring account backup:", e);
              }

              /* Push Result */
              results.push(purchase);
            } catch (error) {
              console.error("Error purchasing account:", error);
              results.push({ success: false, error: error.message });
            } finally {
              incrementProgress();
            }
          },
        );

        await Promise.allSettled(chunk);
      }

      return results;
    },
  });

  /** Purchase Accounts */
  const purchaseAccounts = async () => {
    /* Log Purchase Details */
    console.log("Purchasing", count, "accounts for country", country.code);

    /* Log 2FA Password */
    console.log("Using 2FA password:", password);

    /* Execute Mutation */
    const results = await mutation.mutateAsync({
      count,
      batch,
      twoFA: password,
      enableLocalTelegramSession,
    });

    /* Log Results */
    console.log("Purchase results:", results);

    /* Toast Completion */
    toast.success("Account purchase process completed.");
  };

  return {
    count,
    setCount,

    batch,
    setBatch,

    password,
    setPassword,

    enableLocalTelegramSession,
    setEnableLocalTelegramSession,

    totalPrice,

    country,

    containerRef,
    mutation,
    progress,
    resetProgress,
    incrementProgress,
    restoreAccountBackup,
    purchaseAccounts,
  };
};

export { useSpiderAccountsForm };

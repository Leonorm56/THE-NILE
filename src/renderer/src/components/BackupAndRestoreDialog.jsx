import { chunkArrayGenerator, cn } from "../lib/utils";
import { useCallback, useState } from "react";

import Alert from "./Alert";
import AppDialogContent from "./AppDialogContent";
import { LuDatabaseBackup } from "react-icons/lu";
import PrimaryButton from "./PrimaryButton";
import { Progress } from "./Progress";
import Tabs from "./Tabs";
import { formatDate } from "date-fns";
import toast from "react-hot-toast";
import useAppStore from "../store/useAppStore";
import useBackupAndRestore from "../hooks/useBackupAndRestore";
import { useDropzone } from "react-dropzone";
import { useProgress } from "../hooks/useProgress";
import useSettingsStore from "../store/useSettingsStore";
import useTabs from "../hooks/useTabs";

export default function BackupAndRestoreDialog() {
  const accounts = useAppStore((state) => state.accounts);
  const theme = useSettingsStore((state) => state.theme);
  const allowProxies = useSettingsStore((state) => state.allowProxies);
  const extensionPath = useSettingsStore((state) => state.extensionPath);
  const closeAllAccounts = useAppStore((state) => state.closeAllAccounts);
  const [isProcessing, setIsProcessing] = useState(false);

  const { target, progress, setTarget, resetProgress, incrementProgress } =
    useProgress();

  const { containerRef, getOrRestoreAccountBackup } = useBackupAndRestore();

  /** Save Backup File */
  const saveBackupFile = useCallback(
    (data) =>
      window.electron.ipcRenderer.invoke(
        "save-backup-file",
        `the-nile-backup-${formatDate(new Date(), "yyyyMMdd-HHmmss")}.json`,
        JSON.stringify(data, null, 2),
      ),
    [],
  );

  /** Get Backup Data */
  const getBackupData = useCallback(async () => {
    /** Close opened accounts */
    closeAllAccounts();

    /** Reset State */
    setIsProcessing(true);
    resetProgress();
    setTarget(accounts.length);

    /** Create Backups Array */
    const backups = [];

    for (const chunk of chunkArrayGenerator(accounts, 3)) {
      const chunkResults = await Promise.all(
        chunk.map(async (account) => {
          const result = await getOrRestoreAccountBackup(account);

          /** Increment */
          incrementProgress();

          /** Add Backup */
          return {
            partition: account.partition,
            backup: result,
          };
        }),
      );

      backups.push(...chunkResults);
    }

    /** Release Lock */
    setIsProcessing(false);

    return {
      app: useAppStore.getState(),
      settings: useSettingsStore.getState(),
      backups,
    };
  }, [
    accounts,
    closeAllAccounts,
    getOrRestoreAccountBackup,
    setIsProcessing,
    incrementProgress,
    resetProgress,
    setTarget,
  ]);

  /** Backup All Data */
  const backupData = useCallback(async () => {
    toast
      .promise(
        getBackupData().then((data) => {
          saveBackupFile(data);
        }),
        {
          loading: "Creating Backup...",
          error: "Failed to Create Backup!",
          success: "Backup was successfully created!",
        },
      )
      .catch((e) => {
        console.error(e);
      });
  }, [getBackupData, saveBackupFile]);

  /** Restore Backup */
  const restoreBackup = useCallback(
    async (data) => {
      /** Close opened accounts */
      closeAllAccounts();

      /** Reset State */
      setIsProcessing(true);
      resetProgress();
      setTarget(data.backups.length);

      /** Destructure Data */
      const { app, settings, backups } = data;

      for (const chunk of chunkArrayGenerator(backups, 3)) {
        await Promise.all(
          chunk.map(async (item) => {
            const account = app.accounts.find(
              (account) => account.partition === item.partition,
            );
            await getOrRestoreAccountBackup(account, item.backup);

            /** Increment */
            incrementProgress();
          }),
        );
      }

      /** Restore States */
      useAppStore.setState(app);
      useSettingsStore.setState({ ...settings, extensionPath });

      /** Release Lock */
      setIsProcessing(false);
    },
    [
      extensionPath,
      closeAllAccounts,
      setIsProcessing,
      getOrRestoreAccountBackup,
      incrementProgress,
      resetProgress,
      setTarget,
    ],
  );

  /** On backup file drop */
  const onDrop = useCallback(
    (acceptedFiles) => {
      const file = acceptedFiles[0];
      const reader = new FileReader();

      reader.addEventListener("load", (e) => {
        try {
          const data = JSON.parse(e.target.result);
          toast
            .promise(restoreBackup(data), {
              loading: "Restoring Backup...",
              error: "Failed to Restore Backup!",
              success: "Backup was successfully restored!",
            })
            .catch((e) => {
              console.error(e);
            });
        } catch (err) {
          toast.error("Invalid JSON file!");
        }
      });
      reader.readAsText(file);
    },
    [restoreBackup],
  );

  /** Dropzone */
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/json": [".json"],
    },
    maxFiles: 1,
    multiple: false,
    disabled: isProcessing,
  });

  /** Tabs */
  const tabs = useTabs(["backup", "restore"], "backup");

  return (
    <AppDialogContent
      title={"Backup and Restore"}
      description={"Create or Restore Backup"}
      icon={LuDatabaseBackup}
    >
      <Tabs tabs={tabs}>
        {/* Backup */}
        <Tabs.Content value="backup" className="flex flex-col gap-2">
          <Alert variant={"warning"} className="text-center">
            You are about to backup all data of the application. This includes
            accounts and their Telegram Web data.
          </Alert>

          <PrimaryButton disabled={isProcessing} onClick={backupData}>
            Backup Now
          </PrimaryButton>
        </Tabs.Content>

        {/* Restore */}
        <Tabs.Content value="restore" className="flex flex-col gap-2">
          <Alert variant={"warning"} className="text-center">
            You are about to restore all data of the application. This includes
            accounts and their Telegram Web data.
          </Alert>

          {/* Drop Zone */}
          <div
            {...getRootProps()}
            className={cn(
              "border border-dashed border-orange-500",
              "px-4 py-10 text-center rounded-xl",
              "text-orange-500",
            )}
          >
            <input {...getInputProps()} />
            {isDragActive ? (
              <p>Drop the backup file here ...</p>
            ) : (
              <p>
                Drag 'n' drop the backup file here, or click to select backup
                file
              </p>
            )}
          </div>
        </Tabs.Content>
      </Tabs>

      {isProcessing ? <Progress current={progress} max={target} /> : null}

      {/* Webview Containers */}
      <div ref={containerRef}></div>
    </AppDialogContent>
  );
}

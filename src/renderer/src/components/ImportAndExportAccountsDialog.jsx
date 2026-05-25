import { chunkArrayGenerator, cn } from "../lib/utils";
import { useCallback, useState } from "react";

import AccountsPicker from "./AccountsPicker";
import Alert from "./Alert";
import AppDialogContent from "./AppDialogContent";
import { LuUsers } from "react-icons/lu";
import PrimaryButton from "./PrimaryButton";
import { Progress } from "./Progress";
import Tabs from "./Tabs";
import { formatDate } from "date-fns";
import toast from "react-hot-toast";
import useAccountsSelector from "../hooks/useAccountsSelector";
import useAppStore from "../store/useAppStore";
import useBackupAndRestore from "../hooks/useBackupAndRestore";
import { useDropzone } from "react-dropzone";
import { useProgress } from "../hooks/useProgress";
import useTabs from "../hooks/useTabs";

export default function ImportAndExportAccountsDialog() {
  const [isProcessing, setIsProcessing] = useState(false);

  const accounts = useAppStore((state) => state.accounts);
  const importAccounts = useAppStore((state) => state.importAccounts);
  const closeAllAccounts = useAppStore((state) => state.closeAllAccounts);

  const { target, progress, setTarget, resetProgress, incrementProgress } =
    useProgress();

  const { containerRef, getOrRestoreAccountBackup } = useBackupAndRestore();

  /** Tabs */
  const tabs = useTabs(["export", "import"], "export");

  /** Selector */
  const selector = useAccountsSelector(accounts);

  /** Save Backup File */
  const saveBackupFile = useCallback(
    (data) =>
      window.electron.ipcRenderer.invoke(
        "save-backup-file",
        `the-nile-accounts-export-${formatDate(new Date(), "yyyyMMdd-HHmmss")}.json`,
        JSON.stringify(data, null, 2),
      ),
    [],
  );

  /** Get Export Data */
  const getExportData = async () => {
    /** Close opened accounts */
    closeAllAccounts();

    /** Reset State */
    setIsProcessing(true);
    resetProgress();
    setTarget(selector.selectedAccounts.length);

    /** Create Backups Array */
    const backups = [];

    for (const chunk of chunkArrayGenerator(selector.selectedAccounts, 3)) {
      const chunkResults = await Promise.all(
        chunk.map(async (account) => {
          const result = await getOrRestoreAccountBackup(account);

          /** Increment */
          incrementProgress();

          /** Add Backup */
          return {
            account,
            backup: result,
          };
        }),
      );

      backups.push(...chunkResults);
    }

    /** Release Lock */
    setIsProcessing(false);

    return {
      accounts: backups,
    };
  };

  /** Export accounts */
  const exportAccounts = useCallback(async () => {
    toast
      .promise(
        getExportData().then((data) => {
          saveBackupFile(data);
        }),
        {
          loading: "Exporting Accounts...",
          error: "Failed to Export Accounts!",
          success: "Accounts were successfully exported!",
        },
      )
      .catch((e) => {
        console.error(e);
      });
  }, [getExportData, saveBackupFile]);

  /** Import Accounts */
  const importAccountsBackup = async (data) => {
    /** Close opened accounts */
    closeAllAccounts();

    /** Reset State */
    setIsProcessing(true);
    resetProgress();
    setTarget(data.accounts.length);

    /** Destructure Data */
    const { accounts } = data;

    for (const chunk of chunkArrayGenerator(accounts, 3)) {
      await Promise.all(
        chunk.map(async (item) => {
          const { account, backup } = item;
          await getOrRestoreAccountBackup(account, backup);

          /** Increment */
          incrementProgress();
        }),
      );
    }

    /** Imported list */
    const imported = accounts.map((item) => item.account);

    /** Import accounts */
    importAccounts(imported);

    /** Release Lock */
    setIsProcessing(false);
  };

  /** On backup file drop */
  const onDrop = useCallback(
    (acceptedFiles) => {
      const file = acceptedFiles[0];
      const reader = new FileReader();

      reader.addEventListener("load", (e) => {
        try {
          const data = JSON.parse(e.target.result);
          toast
            .promise(importAccountsBackup(data), {
              loading: "Importing accounts...",
              error: "Failed to Import Accounts!",
              success: "Accounts were successfully imported!",
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
    [importAccounts],
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

  return (
    <AppDialogContent
      title={"Import and Export"}
      description={"Export or Import accounts"}
      icon={LuUsers}
    >
      <Tabs tabs={tabs}>
        {/* Export */}
        <Tabs.Content value="export" className="flex flex-col gap-2">
          <AccountsPicker {...selector} disabled={isProcessing} />

          <PrimaryButton disabled={isProcessing} onClick={exportAccounts}>
            Export
          </PrimaryButton>
        </Tabs.Content>

        {/* Import */}
        <Tabs.Content value="import" className="flex flex-col gap-2">
          <Alert variant={"warning"} className="text-center">
            You are about to import new accounts into the application.
          </Alert>

          {/* Drop Zone */}
          <div
            {...getRootProps()}
            className={cn(
              "border border-dashed border-nile-gold",
              "px-4 py-10 text-center rounded-xl",
              "text-nile-gold",
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

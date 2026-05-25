import { AiOutlineFolder, AiOutlineSelect } from "react-icons/ai";
import { Dialog } from "radix-ui";
import { HiOutlineCog6Tooth } from "react-icons/hi2";
import { useCallback } from "react";

import AppDialogContent from "./AppDialogContent";
import Input from "./Input";
import LabelToggle from "./LabelToggle";
import useSettingsStore from "../store/useSettingsStore";
import { cn } from "../lib/utils";
import { NumberInput } from "./NumberInput";

export default function SettingsDialog() {
  const theme = useSettingsStore((state) => state.theme);
  const rows = useSettingsStore((state) => state.rows);
  const columns = useSettingsStore((state) => state.columns);
  const allowProxies = useSettingsStore((state) => state.allowProxies);
  const autoUpdateExtension = useSettingsStore(
    (state) => state.autoUpdateExtension
  );
  const extensionPath = useSettingsStore((state) => state.extensionPath);
  const showAccountDetails = useSettingsStore(
    (state) => state.showAccountDetails
  );
  const restoreAccountsOnStartup = useSettingsStore(
    (state) => state.restoreAccountsOnStartup
  );
  const showWebviewToolbar = useSettingsStore(
    (state) => state.showWebviewToolbar
  );
  const setColumns = useSettingsStore((state) => state.setColumns);
  const setRows = useSettingsStore((state) => state.setRows);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setExtensionPath = useSettingsStore((state) => state.setExtensionPath);
  const setAllowProxies = useSettingsStore((state) => state.setAllowProxies);
  const setAutoUpdateExtension = useSettingsStore(
    (state) => state.setAutoUpdateExtension
  );
  const setShowAccountDetails = useSettingsStore(
    (state) => state.setShowAccountDetails
  );
  const setShowWebviewToolbar = useSettingsStore(
    (state) => state.setShowWebviewToolbar
  );
  const setRestoreAccountsOnStartup = useSettingsStore(
    (state) => state.setRestoreAccountsOnStartup
  );

  /** Open Extension Path */
  const openExtensionPath = useCallback(async () => {
    await window.electron.ipcRenderer.invoke("open-path", extensionPath);
  }, [extensionPath]);

  /** Pick Extension Path */
  const pickExtensionPath = useCallback(async () => {
    const result = await window.electron.ipcRenderer.invoke(
      "pick-extension-path",
      extensionPath
    );

    if (!result.canceled) {
      const path = result.filePaths[0];
      setExtensionPath(path);
    }
  }, [extensionPath, setExtensionPath]);

  return (
    <AppDialogContent
      title={"Settings"}
      description={"Configure Settings"}
      icon={HiOutlineCog6Tooth}
    >
      {/* Preferred Theme */}
      <label className="text-orange-500 mt-2">Preferred Theme</label>
      <div className="grid grid-cols-3 gap-2">
        {["system", "light", "dark"].map((value) => (
          <button
            onClick={() => setTheme(value)}
            key={value}
            className={cn(
              theme === value && "text-orange-500",
              "bg-neutral-100 dark:bg-neutral-700",
              "p-2 rounded-xl",
              "flex gap-1 items-center justify-center",
              "uppercase font-bold"
            )}
          >
            {value}
          </button>
        ))}
      </div>

      {/* Webview Options */}
      <label className="text-orange-500 mt-2">Webview Options</label>
      <LabelToggle
        onChange={(ev) => setShowWebviewToolbar(ev.target.checked)}
        checked={showWebviewToolbar}
      >
        Show Webview Toolbar
      </LabelToggle>

      {/* Proxy */}
      <LabelToggle
        onChange={(ev) => setAllowProxies(ev.target.checked)}
        checked={allowProxies}
      >
        Allow Proxies
      </LabelToggle>

      <p className="text-neutral-500 dark:text-neutral-400">
        Proxies may be enabled for accounts, but without this option being
        enabled they won't be used.
      </p>

      <label className="text-orange-500 mt-2">Accounts</label>

      <LabelToggle
        onChange={(ev) => setShowAccountDetails(ev.target.checked)}
        checked={showAccountDetails}
      >
        Show Account Details
      </LabelToggle>

      <LabelToggle
        onChange={(ev) => setRestoreAccountsOnStartup(ev.target.checked)}
        checked={restoreAccountsOnStartup}
      >
        Restore Accounts on Startup
      </LabelToggle>

      {/* Columns and Rows */}
      <div className="grid grid-cols-2 gap-2">
        <NumberInput
          label={"Columns"}
          value={columns}
          onChange={(newValue) => setColumns(newValue || 1)}
        />

        <NumberInput
          label={"Rows"}
          value={rows}
          onChange={(newValue) => setRows(newValue || 1)}
        />
      </div>

      {/* Extension Path */}
      <label className="text-orange-500 mt-2">Extension Path</label>
      <div className="flex gap-2">
        <Input readOnly value={extensionPath} />

        <button
          onClick={openExtensionPath}
          className={cn(
            "bg-neutral-100 dark:bg-neutral-700",
            "hover:bg-orange-100 hover:text-orange-700",
            "dark:hover:bg-orange-200 dark:hover:text-orange-500",
            "flex items-center justify-center",
            "p-1 px-3 rounded-lg"
          )}
        >
          <AiOutlineFolder className="size-4" />
        </button>

        <button
          onClick={pickExtensionPath}
          className={cn(
            "bg-neutral-100 dark:bg-neutral-700",
            "hover:bg-orange-100 hover:text-orange-700",
            "dark:hover:bg-orange-200 dark:hover:text-orange-500",
            "flex items-center justify-center",
            "p-1 px-3 rounded-lg"
          )}
        >
          <AiOutlineSelect className="size-4" />
        </button>
      </div>

      {/* Auto-Update Extension */}
      <LabelToggle
        onChange={(ev) => setAutoUpdateExtension(ev.target.checked)}
        checked={autoUpdateExtension}
      >
        Auto-Update Extension
      </LabelToggle>

      {/* Close Dialog */}
      <Dialog.Close
        className={cn(
          "px-4 py-2.5 bg-orange-500 text-white rounded-xl",
          "mt-2 font-bold"
        )}
      >
        Close
      </Dialog.Close>
    </AppDialogContent>
  );
}

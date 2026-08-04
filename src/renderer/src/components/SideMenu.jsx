import {
  HiOutlineArrowPath,
  HiOutlineArrowsPointingOut,
  HiOutlineBars3,
  HiOutlineCog6Tooth,
  HiOutlinePuzzlePiece,
} from "react-icons/hi2";
import { LuArrowUpDown, LuDatabaseBackup, LuTags } from "react-icons/lu";
import { useCallback, useEffect, useState } from "react";

import AccountListDialog from "./AccountListDialog";
import AppInfoDialog from "./AppInfoDialog";
import BackupAndRestoreDialog from "./BackupAndRestoreDialog";
import { Dialog } from "radix-ui";
import { FaSpider } from "react-icons/fa";
import Icon from "../assets/images/icon.png";
import ImportAndExportAccountsDialog from "./ImportAndExportAccountsDialog";
import LoaderDialog from "./LoaderDialog";
import { MdOutlineBrowserUpdated } from "react-icons/md";
import SettingsDialog from "./SettingsDialog";
import SpiderDialog from "./SpiderDialog";
import { SpiderProvider } from "./SpiderProvider";
import TagsDialog from "./TagsDialog";
import axios from "axios";
import { cn } from "../lib/utils";
import semver from "semver";

export default function SideMenu() {
  const [currentVersion, setCurrentVersion] = useState(null);
  const [latestVersion, setLatestVersion] = useState(null);

  /** Toggle FullScreen */
  const toggleFullScreen = useCallback(function () {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }, []);

  /** Get App Version */
  useEffect(() => {
    window.electron.ipcRenderer
      .invoke("get-app-version")
      .then((version) => setCurrentVersion("v" + version));
  }, [setCurrentVersion]);

  /** Get Latest Release */
  useEffect(() => {
    axios
      .get(import.meta.env.VITE_APP_RELEASE_API_URL)
      .then((res) => setLatestVersion(res.data["tag_name"]));
  }, [setLatestVersion]);

  return (
    <div className="shrink-0 w-14 p-2 h-full flex flex-col gap-2 items-center">
      {/* Account List */}
      <Dialog.Root>
        <Dialog.Trigger title="Accounts" className="p-2">
          <HiOutlineBars3 className="size-5 text-nile-gold" />
        </Dialog.Trigger>

        <AccountListDialog />
      </Dialog.Root>

      {/* Tags */}
      <Dialog.Root>
        <Dialog.Trigger title="Tags" className="p-2">
          <LuTags className="size-5 text-nile-gold" />
        </Dialog.Trigger>

        <TagsDialog />
      </Dialog.Root>

      {/* Settings */}
      <Dialog.Root>
        <Dialog.Trigger title="Settings" className="p-2">
          <HiOutlineCog6Tooth className="size-5 text-nile-gold" />
        </Dialog.Trigger>

        <SettingsDialog />
      </Dialog.Root>

      {/* Backup and Restore */}
      <Dialog.Root>
        <Dialog.Trigger title="Backup and Restore" className="p-2">
          <LuDatabaseBackup className="size-5 text-nile-gold" />
        </Dialog.Trigger>

        <BackupAndRestoreDialog />
      </Dialog.Root>

      {/* Import and Export Accounts */}
      <Dialog.Root>
        <Dialog.Trigger title="Import and Export accounts" className="p-2">
          <LuArrowUpDown className="size-5 text-nile-gold" />
        </Dialog.Trigger>

        <ImportAndExportAccountsDialog />
      </Dialog.Root>

      {/* Spider */}
      <Dialog.Root>
        <Dialog.Trigger title="Spider" className="p-2">
          <FaSpider className="size-5 text-nile-gold" />
        </Dialog.Trigger>
        <SpiderProvider>
          <SpiderDialog />
        </SpiderProvider>
      </Dialog.Root>

      {/* Fullscreen Toggle */}
      <button
        title="Toggle Fullscreen"
        className="p-2"
        onClick={toggleFullScreen}
      >
        <HiOutlineArrowsPointingOut className="size-5 text-nile-gold" />
      </button>

      {/* App Icon */}
      <Dialog.Root>
        <Dialog.Trigger className="mt-auto size-10 relative flex">
          <img src={Icon} alt="THE NILE" className="size-full " />

          {/* Latest Version Alert */}
          {latestVersion && semver.gt(latestVersion, currentVersion) ? (
            <span
              className={cn(
                "absolute rounded-full size-5 bg-red-500 text-white",
                "flex items-center justify-center",
                "-left-1 -top-1",
              )}
            >
              <MdOutlineBrowserUpdated className="size-4" />
            </span>
          ) : null}
        </Dialog.Trigger>
        <AppInfoDialog
          currentVersion={currentVersion}
          latestVersion={latestVersion}
        />
      </Dialog.Root>

      {/* Loader */}
      <Dialog.Root>
        <Dialog.Trigger title="Loader" className="p-2">
          <HiOutlinePuzzlePiece className="size-5 text-nile-gold" />
        </Dialog.Trigger>

        <LoaderDialog />
      </Dialog.Root>

      {/* Reload */}
      <button
        title="Reload App"
        className="p-2"
        onClick={() => window.location.reload()}
      >
        <HiOutlineArrowPath className="size-5 text-nile-gold" />
      </button>
    </div>
  );
}

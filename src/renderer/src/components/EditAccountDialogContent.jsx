import { HiOutlineTrash } from "react-icons/hi2";
import { LuUserRoundPen } from "react-icons/lu";
import { useCallback } from "react";

import AccountForm from "./AccountForm";
import AppDialogContent from "./AppDialogContent";
import useAppStore from "../store/useAppStore";
import { cn } from "../lib/utils";

export default function EditAccountDialogContent({ account, close }) {
  const updateAccount = useAppStore((state) => state.updateAccount);
  const removeAccount = useAppStore((state) => state.removeAccount);
  const closeAccount = useAppStore((state) => state.closeAccount);

  /** Save Account Data */
  const saveAccountData = useCallback(
    (data) => {
      updateAccount(data);
      close();
    },
    [updateAccount, close]
  );

  /** Delete Account */
  const deleteAccount = useCallback(async () => {
    closeAccount(account.partition);
    removeAccount(account.partition);
    await window.electron.ipcRenderer.invoke(
      "remove-session",
      account.partition
    );
  }, [account, removeAccount, closeAccount]);

  return (
    <AppDialogContent
      title={"Modify Account"}
      description={"Update Account Data"}
      icon={LuUserRoundPen}
    >
      <AccountForm account={account} handleFormSubmit={saveAccountData} />

      <p className="text-center text-neutral-500 dark:text-neutral-400">OR</p>

      <button
        onClick={deleteAccount}
        className={cn(
          "px-4 py-2.5 border border-red-500 text-red-500 rounded-xl",
          "flex items-center justify-center gap-2"
        )}
      >
        <HiOutlineTrash className="size-4" />
        Delete Account
      </button>
    </AppDialogContent>
  );
}

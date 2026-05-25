import { Dialog } from "radix-ui";
import { MdOutlineEditNote } from "react-icons/md";
import { cn } from "../lib/utils";

import useDialogState from "../hooks/useDialogState";
import EditAccountDialogContent from "./EditAccountDialogContent";

export const AccountEditDialog = ({ account }) => {
  const {
    opened: openEditAccountDialog,
    setOpened: setOpenEditAccountDialog,
    closeDialog: closeEditAccountDialog,
  } = useDialogState();

  return (
    <Dialog.Root
      open={openEditAccountDialog}
      onOpenChange={setOpenEditAccountDialog}
    >
      <Dialog.Trigger
        className={cn(
          "bg-neutral-100 dark:bg-neutral-700",
          "hover:bg-nile-gold-100 hover:text-nile-gold-700",
          "dark:hover:bg-nile-gold-200 dark:hover:text-nile-gold",
          "flex items-center justify-center",
          "px-3 rounded-xl shrink-0"
        )}
      >
        <MdOutlineEditNote className="size-4" />
      </Dialog.Trigger>
      <EditAccountDialogContent
        account={account}
        close={closeEditAccountDialog}
      />
    </Dialog.Root>
  );
};

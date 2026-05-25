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
          "hover:bg-orange-100 hover:text-orange-700",
          "dark:hover:bg-orange-200 dark:hover:text-orange-500",
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

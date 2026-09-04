import { cn, matchesSearch } from "../lib/utils";
import { useMemo, useState } from "react";

import { AccountItem } from "./AccountItem";
import AddAccountDialog from "./AddAccountDialog";
import { Dialog } from "radix-ui";
import { HiOutlinePencilSquare, HiOutlinePlus } from "react-icons/hi2";
import Input from "./Input";
import { Reorder } from "motion/react";
import ReorderItem from "./ReorderItem";
import TagsList from "./TagsList";
import toast from "react-hot-toast";
import useAppStore from "../store/useAppStore";
import useDialogState from "../hooks/useDialogState";

export default function AccountListDialog() {
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState(null);
  const tags = useAppStore((state) => state.tags);
  const accounts = useAppStore((state) => state.accounts);
  const setAccounts = useAppStore((state) => state.setAccounts);
  const launchAccount = useAppStore((state) => state.launchAccount);
  const activeTag = selectedTag
    ? tags.find((item) => item.id === selectedTag)
    : null;

  const list = useMemo(
    () =>
      search
        ? accounts.filter((item) => matchesSearch(search, item))
        : activeTag
          ? accounts.filter((item) => item.tags?.includes(activeTag.id))
          : accounts,
    [search, activeTag, accounts],
  );

  const {
    opened: openAddAccountDialog,
    setOpened: setOpenAddAccountDialog,
    closeDialog: closeAddAccountDialog,
  } = useDialogState();

  /** Force rename confirmation state */
  const [openRenameDialog, setOpenRenameDialog] = useState(false);

  /** Force Rename All — renames every visible account to "Account N" in list order */
  const renameAllAccounts = () => {
    const renames = new Map(
      list.map((account, index) => [account.partition, `Account ${index + 1}`]),
    );

    /* Single store update — no per-item writes, safe at 100+ accounts */
    setAccounts(
      accounts.map((account) =>
        renames.has(account.partition)
          ? { ...account, title: renames.get(account.partition) }
          : account,
      ),
    );

    setOpenRenameDialog(false);
    toast.success(`Renamed ${renames.size} account(s).`);
  };

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 bg-black/50" />
      <Dialog.Content
        onOpenAutoFocus={(ev) => ev.preventDefault()}
        className={cn(
          "fixed inset-y-0 left-0",
          "w-5/6 max-w-xs",
          "bg-white dark:bg-neutral-800",
          "flex flex-col",
        )}
      >
        <div className="p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="flex flex-col grow">
              {/* Title */}
              <Dialog.Title
                className={cn(
                  "leading-none font-bold font-turret-road",
                  "text-lg text-nile-gold",
                )}
              >
                Accounts ({accounts.length})
              </Dialog.Title>

              {/* Description */}
              <Dialog.Description className="text-neutral-500 dark:text-neutral-400 leading-none">
                Select an account
              </Dialog.Description>
            </div>

            {/* Add Account */}
            <Dialog.Root
              open={openAddAccountDialog}
              onOpenChange={setOpenAddAccountDialog}
            >
              <Dialog.Trigger
                title="Add Account"
                className={cn(
                  "shrink-0",
                  "bg-nile-gold-100 text-nile-gold-700",
                  "dark:bg-nile-gold-200 dark:text-nile-gold",
                  "flex items-center gap-2",
                  "p-2 px-3 rounded-xl text-left",
                  "font-bold",
                )}
              >
                <HiOutlinePlus className="size-5 text-nile-gold" />
              </Dialog.Trigger>

              <AddAccountDialog close={closeAddAccountDialog} />
            </Dialog.Root>
          </div>

          {/* Search Input */}
          <Input
            autoFocus
            type="search"
            placeholder={"Search"}
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
          />

          {/* Force Rename All */}
          <button
            title="Force Rename All"
            disabled={list.length === 0}
            onClick={() => setOpenRenameDialog(true)}
            className={cn(
              "flex items-center justify-center gap-2",
              "p-2 rounded-xl text-left font-bold",
              "border border-nile-gold text-nile-gold",
              "hover:bg-nile-gold-100 dark:hover:bg-nile-gold-200",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            <HiOutlinePencilSquare className="size-5" />
            Force Rename All
          </button>

          {/* Force Rename Confirmation */}
          <Dialog.Root
            open={openRenameDialog}
            onOpenChange={setOpenRenameDialog}
          >
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/50" />
              <Dialog.Content
                onOpenAutoFocus={(ev) => ev.preventDefault()}
                className={cn(
                  "fixed inset-0 m-auto",
                  "h-fit w-full max-w-sm",
                  "bg-white dark:bg-neutral-800",
                  "p-4 rounded-xl",
                  "flex flex-col gap-2",
                )}
              >
                <Dialog.Title
                  className={cn(
                    "font-bold font-turret-road text-lg text-nile-gold",
                  )}
                >
                  Force Rename All
                </Dialog.Title>
                <Dialog.Description className="text-neutral-500 dark:text-neutral-400">
                  This will rename all {list.length} accounts. Custom names
                  will be lost. Continue?
                </Dialog.Description>

                <div className="flex items-center justify-end gap-2 mt-2">
                  <button
                    onClick={() => setOpenRenameDialog(false)}
                    className={cn(
                      "px-4 py-2.5 rounded-xl font-bold",
                      "text-neutral-500 hover:text-neutral-700",
                    )}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={renameAllAccounts}
                    className={cn(
                      "px-4 py-2.5 rounded-xl font-bold",
                      "bg-nile-gold text-white",
                      "hover:bg-nile-gold-600",
                    )}
                  >
                    Continue
                  </button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>

          {/* Tags */}
          <TagsList
            accounts={accounts}
            tags={tags}
            activeTag={activeTag}
            setSelectedTag={setSelectedTag}
          />
        </div>

        {/* Account List */}
        <div className="flex flex-col px-4 pb-4 gap-2 grow overflow-auto">
          <Reorder.Group
            values={accounts}
            onReorder={(newOrder) => setAccounts(newOrder)}
            className="flex flex-col gap-2"
          >
            {list.map((item) => (
              <ReorderItem
                key={item.partition}
                value={item}
                disabled={Boolean(search || activeTag)}
              >
                <AccountItem
                  account={item}
                  active={item.running}
                  onClick={() => launchAccount(item.partition)}
                />
              </ReorderItem>
            ))}
          </Reorder.Group>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

import { cn, matchesSearch } from "../lib/utils";
import { useMemo, useState } from "react";

import { AccountItem } from "./AccountItem";
import AddAccountDialog from "./AddAccountDialog";
import { Dialog } from "radix-ui";
import { HiOutlinePlus } from "react-icons/hi2";
import Input from "./Input";
import { Reorder } from "motion/react";
import ReorderItem from "./ReorderItem";
import TagsList from "./TagsList";
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
                  "text-lg text-orange-500",
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
                  "bg-orange-100 text-orange-700",
                  "dark:bg-orange-200 dark:text-orange-500",
                  "flex items-center gap-2",
                  "p-2 px-3 rounded-xl text-left",
                  "font-bold",
                )}
              >
                <HiOutlinePlus className="size-5 text-orange-500" />
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

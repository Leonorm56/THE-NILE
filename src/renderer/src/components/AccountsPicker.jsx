import { useMemo, useState } from "react";

import AccountsPickerItem from "./AccountsPickerItem";
import Input from "./Input";
import LabelToggle from "./LabelToggle";
import TagsList from "./TagsList";
import { matchesSearch } from "../lib/utils";
import useAppStore from "../store/useAppStore";

export default function AccountsPicker({
  accounts,
  disabled,
  allSelected,
  selectedAccounts,
  setSelectedAccounts,
  toggleAccount,
  toggleAllAccounts,
}) {
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState(null);
  const tags = useAppStore((state) => state.tags);
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

  return (
    <div className="flex flex-col gap-2">
      {/* Account List Heading */}
      <h4 className="px-4 text-center">
        Accounts ({selectedAccounts.length} / {accounts.length})
      </h4>

      {/* Search Input */}
      <Input
        autoFocus
        type="search"
        placeholder={"Search"}
        disabled={disabled}
        value={search}
        onChange={(ev) => setSearch(ev.target.value)}
      />

      {/* Tags */}
      <TagsList
        accounts={accounts}
        tags={tags}
        disabled={disabled}
        activeTag={activeTag}
        setSelectedTag={setSelectedTag}
      />

      <LabelToggle
        disabled={disabled}
        checked={allSelected}
        onChange={(ev) => toggleAllAccounts(ev.target.checked)}
      >
        Toggle Accounts
      </LabelToggle>

      <div className="max-h-96 overflow-auto -mx-2 p-2">
        <div className="flex flex-col gap-2">
          {list.map((account) => (
            <AccountsPickerItem
              key={account.partition}
              account={account}
              checked={selectedAccounts.some(
                (item) => item.partition === account.partition,
              )}
              onChange={(ev) => toggleAccount(account, ev.target.checked)}
              disabled={disabled}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

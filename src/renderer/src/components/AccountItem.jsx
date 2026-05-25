import { HiOutlineCheckBadge, HiTag } from "react-icons/hi2";
import {
  cn,
  extractInitDataUnsafe,
  getTelegramUserFullName,
} from "../lib/utils";

import { AccountEditDialog } from "./AccountEditDialog";
import { LiaUser } from "react-icons/lia";
import { useMemo } from "react";
import useSettingsStore from "../store/useSettingsStore";

export const AccountItem = ({ account, active, onClick }) => {
  const showAccountDetails = useSettingsStore(
    (state) => state.showAccountDetails,
  );
  const user = useMemo(() => {
    if (account.telegramInitData) {
      return extractInitDataUnsafe(account.telegramInitData)["user"];
    } else {
      return null;
    }
  }, [account.telegramInitData]);

  const userFullName = useMemo(
    () => (user ? getTelegramUserFullName(user) : ""),
    [user],
  );

  return (
    <div className="flex gap-2">
      <button
        key={account.partition}
        onClick={onClick}
        className={cn(
          "bg-neutral-100 dark:bg-neutral-700",
          "hover:bg-orange-100 hover:text-orange-700",
          "dark:hover:bg-orange-200 dark:hover:text-orange-500",
          "grow min-w-0 flex items-center gap-2",
          "rounded-xl text-left",
          "group",
          showAccountDetails ? "px-2 py-1" : "px-3 py-2",
        )}
      >
        {/* User  */}
        {showAccountDetails ? (
          user?.["photo_url"] ? (
            <img
              src={user?.["photo_url"]}
              className="size-8 shrink-0 rounded-full"
              loading="lazy"
            />
          ) : (
            <div className="p-1 shrink-0">
              <LiaUser className="size-5" />
            </div>
          )
        ) : null}

        <div className="flex flex-col grow min-w-0">
          {/* Title */}
          <h1 className="font-bold truncate w-full">
            {account.title}{" "}
            {showAccountDetails && userFullName ? (
              <span
                className={cn(
                  "text-neutral-500 dark:text-neutral-400",
                  "group-hover:text-orange-900",
                )}
              >
                ({userFullName})
              </span>
            ) : null}
          </h1>
          {/* Username */}
          {showAccountDetails && user?.["username"] ? (
            <h5
              className={cn(
                "truncate",
                "text-neutral-500 dark:text-neutral-400",
                "group-hover:text-orange-900",
              )}
            >
              @{user["username"]}
            </h5>
          ) : null}
        </div>

        {account.tags?.length ? (
          <HiTag className="shrink-0 text-orange-500" />
        ) : null}
        {active ? (
          <HiOutlineCheckBadge className="shrink-0 text-orange-500 size-4" />
        ) : null}
      </button>

      {/* Edit Dialog */}
      <AccountEditDialog account={account} />
    </div>
  );
};

import { cn, getTelegramUserFullName } from "../lib/utils";

import { LiaUser } from "react-icons/lia";

export default function TelegramUserCard({ user }) {
  if (!user) return null;

  const fullName = getTelegramUserFullName(user);

  return (
    <div
      className={cn(
        "flex items-center gap-2",
        "p-2 rounded-xl",
        "bg-neutral-100 dark:bg-neutral-700"
      )}
    >
      {/* Avatar */}
      {user["photo_url"] ? (
        <img
          src={user["photo_url"]}
          className="size-10 shrink-0 rounded-full"
          loading="lazy"
        />
      ) : (
        <div className="p-1 shrink-0">
          <LiaUser className="size-6" />
        </div>
      )}

      {/* Name & Username */}
      <div className="flex flex-col grow min-w-0">
        <h1 className="font-bold truncate">
          {fullName || `User ${user["id"]}`}
        </h1>
        {user["username"] ? (
          <h5 className="truncate text-neutral-500 dark:text-neutral-400">
            @{user["username"]}
          </h5>
        ) : null}
      </div>

      {/* User ID */}
      {user["id"] ? (
        <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
          ID: {user["id"]}
        </span>
      ) : null}
    </div>
  );
}
import { HiTag } from "react-icons/hi2";
import { cn } from "../lib/utils";

export default function TagsList({
  accounts,
  tags,
  activeTag,
  setSelectedTag,
  disabled,
}) {
  return (
    <div className="flex flex-wrap gap-1 empty:hidden">
      {tags.map((tag) => (
        <button
          key={tag.id}
          disabled={disabled}
          onClick={() =>
            setSelectedTag((prev) => (prev === tag.id ? null : tag.id))
          }
          className={cn(
            "flex items-center gap-1",
            "p-2 rounded-full disabled:opacity-60",
            activeTag && activeTag.id === tag.id
              ? "bg-orange-500 text-white"
              : "bg-neutral-100 dark:bg-neutral-700",
          )}
        >
          <HiTag
            className={cn(
              "size-4",
              activeTag && activeTag.id === tag.id
                ? "text-white"
                : "text-orange-500",
            )}
          />
          {tag.name} (
          {accounts.filter((item) => item.tags?.includes(tag.id)).length})
        </button>
      ))}
    </div>
  );
}

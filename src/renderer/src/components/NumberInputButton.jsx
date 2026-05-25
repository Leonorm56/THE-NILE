import { cn } from "../lib/utils";

export const NumberInputButton = (props) => (
  <button
    {...props}
    className={cn(
      "bg-neutral-100 dark:bg-neutral-700",
      "hover:bg-orange-100 hover:text-orange-700",
      "dark:hover:bg-orange-200 dark:hover:text-orange-500",
      "disabled:opacity-50 disabled:cursor-not-allowed",
      "flex items-center justify-center",
      "p-1 px-3 rounded-lg"
    )}
  />
);

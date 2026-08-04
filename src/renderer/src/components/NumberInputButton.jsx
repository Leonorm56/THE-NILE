import { cn } from "../lib/utils";

export const NumberInputButton = (props) => (
  <button
    {...props}
    className={cn(
      "bg-neutral-100 dark:bg-neutral-700",
      "hover:bg-nile-gold-100 hover:text-nile-gold-700",
      "dark:hover:bg-nile-gold-200 dark:hover:text-nile-gold",
      "disabled:opacity-50 disabled:cursor-not-allowed",
      "flex items-center justify-center",
      "p-2 rounded-xl"
    )}
  />
);

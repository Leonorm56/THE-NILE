import { memo } from "react";

import { cn } from "../lib/utils";

export default memo(function IconButton(props) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "bg-neutral-100 dark:bg-neutral-700",
        "hover:bg-nile-gold-100 hover:text-nile-gold-700",
        "dark:hover:bg-nile-gold-200 dark:hover:text-nile-gold",
        "flex items-center justify-center shrink-0",
        "p-2.5 rounded-xl",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        props.className
      )}
    />
  );
});
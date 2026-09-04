import { memo } from "react";

import { cn } from "../lib/utils";

export default memo(function Select(props) {
  return (
    <select
      {...props}
      className={cn(
        "bg-neutral-100 dark:bg-neutral-700 w-full",
        "p-2.5 rounded-xl font-bold grow min-h-0 min-w-0",
        "focus:outline-hidden focus:ring-3 focus:ring-nile-gold-300",
        "disabled:opacity-50",
        props.className
      )}
    />
  );
});
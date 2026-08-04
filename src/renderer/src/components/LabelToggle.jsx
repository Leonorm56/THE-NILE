import { memo } from "react";

import Toggle from "./Toggle";
import { cn } from "../lib/utils";

export default memo(function LabelToggle({ children, ...props }) {
  return (
    <label
      className={cn(
        "bg-neutral-100 dark:bg-neutral-700",
        "flex items-center gap-4 p-2 cursor-pointer rounded-xl",
        "has-[input:disabled]:opacity-60"
      )}
    >
      <h4 className="min-w-0 min-h-0 grow">{children}</h4> <Toggle {...props} />
    </label>
  );
});

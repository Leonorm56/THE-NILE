import { cn } from "../lib/utils";
import { memo } from "react";

export default memo((props) => (
  <button
    {...props}
    className={cn(
      "bg-neutral-100 dark:bg-neutral-700",
      "not-disabled:hover:bg-orange-100",
      "not-disabled:hover:text-orange-500",
      "dark:not-disabled:hover:bg-orange-200",
      "flex items-center justify-center",
      "p-2 rounded-full shrink-0",
      "disabled:opacity-50",
      props.className,
    )}
  />
));

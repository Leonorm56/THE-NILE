import { memo } from "react";

import { cn } from "../lib/utils";

export default memo(function PrimaryButton({
  as: Component = "button",
  ...props
}) {
  return (
    <Component
      {...props}
      className={cn(
        "px-4 py-2.5 bg-orange-500 rounded-xl",
        "w-full flex justify-center items-center gap-2",
        "font-bold text-white",
        "disabled:opacity-50",
        props.className
      )}
    />
  );
});

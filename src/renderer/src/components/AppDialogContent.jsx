import BaseDialogContent from "./BaseDialogContent";
import { Dialog } from "radix-ui";
import { memo } from "react";

export default memo(function ({
  icon: Icon,
  title,
  description,
  children,
  ...props
}) {
  return (
    <BaseDialogContent {...props}>
      {typeof Icon === "string" ? (
        <img src={Icon} className="size-10 mx-auto" />
      ) : (
        <Icon className="size-10 mx-auto text-orange-500" />
      )}

      <div className="flex flex-col gap-px">
        <Dialog.Title className="text-xl font-bold font-turret-road text-orange-500 text-center">
          {title}
        </Dialog.Title>
        <Dialog.Description className="text-center text-neutral-500 dark:text-neutral-400">
          {description}
        </Dialog.Description>
      </div>

      {children}
    </BaseDialogContent>
  );
});

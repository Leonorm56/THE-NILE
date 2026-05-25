import { Dialog } from "radix-ui";
import { cn } from "../lib/utils";

export default function BaseDialogContent({ children, ...props }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay
        className={cn(
          "fixed inset-0 bg-black/50",
          "grid place-items-center overflow-auto py-10",
          "data-[state=closed]:hidden",
        )}
      >
        <Dialog.Content
          onOpenAutoFocus={(ev) => ev.preventDefault()}
          {...props}
          className={cn(
            "data-[state=closed]:hidden",
            "w-[90vw] max-w-112.5",
            "flex flex-col gap-2",
            "rounded-2xl p-6",
            "bg-white dark:bg-neutral-800",
            props.className,
          )}
        >
          {children}
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog.Portal>
  );
}

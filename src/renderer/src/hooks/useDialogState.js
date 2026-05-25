import { useCallback, useMemo, useState } from "react";

export default function useDialogState() {
  const [opened, setOpened] = useState(false);

  const openDialog = useCallback(() => setOpened(true), [setOpened]);
  const closeDialog = useCallback(() => setOpened(false), [setOpened]);

  return useMemo(
    () => ({
      opened,
      setOpened,
      openDialog,
      closeDialog,
    }),
    [opened, setOpened, openDialog, closeDialog]
  );
}

import { useEffect, useRef } from "react";

import useAppStore from "../store/useAppStore";
import useSettingsStore from "../store/useSettingsStore";

export default function useAccountsRestoration() {
  const startupRef = useRef(false);
  const closeAllAccounts = useAppStore((state) => state.closeAllAccounts);
  const restoreAccountsOnStartup = useSettingsStore(
    (state) => state.restoreAccountsOnStartup
  );

  useEffect(() => {
    if (startupRef.current) return;
    else if (!restoreAccountsOnStartup) {
      closeAllAccounts();
    }

    /** Mark as Restored */
    startupRef.current = true;
  }, [restoreAccountsOnStartup, closeAllAccounts]);
}

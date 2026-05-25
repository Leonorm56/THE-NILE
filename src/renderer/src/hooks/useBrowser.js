import { useCallback, useEffect, useState } from "react";

import { uuid } from "../lib/utils";

export default function useBrowser(partition) {
  const [enabled, setEnabled] = useState(false);
  const [shown, setShown] = useState(false);

  /** Tabs State */
  const [tabs, setTabs] = useState(() => [
    {
      id: uuid(),
      active: true,
      title: "New Tab",
      url: import.meta.env.VITE_DEFAULT_WEBVIEW_URL,
    },
  ]);

  /** Toggle Browser */
  const toggle = useCallback(() => {
    setEnabled(true);
    setShown((prev) => !prev);
  }, []);

  /** Set Active Tab */
  const setActiveTab = useCallback(
    (id) => {
      setTabs((prev) =>
        prev.map((item) => ({ ...item, active: item.id === id }))
      );
    },
    [setTabs]
  );

  /** Add Tab */
  const addTab = useCallback(
    ({ url = import.meta.env.VITE_DEFAULT_WEBVIEW_URL } = {}) => {
      setEnabled(true);
      setShown(true);
      setTabs((prev) => [
        ...prev.map((item) => ({ ...item, active: false })),
        {
          id: uuid(),
          active: true,
          title: "New Tab",
          url,
        },
      ]);
    },
    [setTabs]
  );

  /** Close Tab */
  const closeTab = useCallback(
    (id) => {
      setTabs((prev) => {
        /** Get Index */
        const itemIndex = prev.findIndex((item) => item.id === id);

        if (itemIndex > -1) {
          const wasActive = prev[itemIndex].active;
          const result = prev
            .filter((tab) => tab.id !== id)
            .map((tab, index) => ({
              ...tab,
              active: wasActive
                ? index === Math.max(itemIndex - 1, 0)
                : tab.active,
            }));
          return result;
        } else {
          return prev;
        }
      });
    },
    [setTabs]
  );

  /** Update Title */
  const updateTitle = useCallback(
    (id, title) => {
      setTabs((prev) =>
        prev.map((item) => (item.id === id ? { ...item, title } : item))
      );
    },
    [setTabs]
  );

  /** Update Icon */
  const updateIcon = useCallback(
    (id, icons) => {
      setTabs((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, icon: icons[0] } : item
        )
      );
    },
    [setTabs]
  );

  /** Handle New Window Open */
  useEffect(() => {
    /** Listen for Window Open */
    const listener = (ev, args) => {
      const { id, action, data } = args;
      if (id === partition) {
        switch (action) {
          case "open-window":
            addTab(data);
            break;
        }
      }
    };

    /** Add Listener */
    window.electron.ipcRenderer.on("browser-message", listener);

    return () => {
      /** Remove Listener */
      window.electron.ipcRenderer.removeListener("browser-message", listener);
    };
  }, [addTab]);

  return {
    tabs,
    enabled,
    shown,
    setTabs,
    addTab,
    closeTab,
    setActiveTab,
    updateTitle,
    updateIcon,
    toggle,
  };
}

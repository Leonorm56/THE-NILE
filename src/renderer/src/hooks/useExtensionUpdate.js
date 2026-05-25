import { useEffect } from "react";

import useSettingsStore from "../store/useSettingsStore";

export default function useExtensionUpdate() {
  const autoUpdateExtension = useSettingsStore(
    (state) => state.autoUpdateExtension
  );
  const extensionPath = useSettingsStore((state) => state.extensionPath);
  const setExtensionPath = useSettingsStore((state) => state.setExtensionPath);

  useEffect(() => {
    if (!extensionPath) {
      window.electron.ipcRenderer
        .invoke("get-default-extension-path")
        .then((path) => {
          setExtensionPath(path);
        });
    } else if (autoUpdateExtension) {
      window.electron.ipcRenderer
        .invoke("update-extension", extensionPath)
        .then((result) => {
          console.log("Extension Update Result:", result);
        });
    }
  }, [extensionPath, autoUpdateExtension, setExtensionPath]);
}

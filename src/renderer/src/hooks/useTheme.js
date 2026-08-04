import { useEffect } from "react";
import { useMedia } from "react-use";

export default function useTheme(theme) {
  const systemIsDark = useMedia("(prefers-color-scheme: dark)");

  /** Configure Theme in Main Process */
  useEffect(() => {
    window.electron.ipcRenderer.invoke("configure-theme", theme);
  }, [theme]);

  /** Apply Theme */
  useEffect(() => {
    const isDark = theme === "dark" || (theme === "system" && systemIsDark);

    document.documentElement.classList.toggle("dark", isDark);
    document
      .querySelector("meta[name=theme-color]")
      .setAttribute("content", isDark ? "#262626" : "#ffffff");
  }, [theme, systemIsDark]);
}

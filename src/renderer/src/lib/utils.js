import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export { v4 as uuid } from "uuid";

/** Class Names */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/** Chunk Array Generator */
export function* chunkArrayGenerator(arr, size) {
  for (let i = 0; i < arr.length; i += size) {
    yield arr.slice(i, i + size);
  }
}

/** Get Telegram User Full Name */
export function getTelegramUserFullName(user) {
  return [user["first_name"], user["last_name"]].filter(Boolean).join(" ");
}

/** Search Includes */
export function searchIncludes(value, search) {
  return value.toString().toLowerCase().includes(search.toLowerCase());
}

/** Extract InitDataUnsafe */
export function extractInitDataUnsafe(initData) {
  const parsedInitData = Object.fromEntries(
    new URLSearchParams(initData).entries(),
  );

  return {
    ...parsedInitData,
    user: JSON.parse(parsedInitData.user),
  };
}
/** Create Webview */
export function createWebview(partition, extensionPath, proxyOptions) {
  /** Create the <webview> element */
  const webview = document.createElement("webview");

  /* Set Attributes */
  webview.setAttribute("partition", partition);
  webview.setAttribute("allowpopups", "true");

  /** Add Classes */
  webview.setAttribute("class", "w-full h-full opacity-0 fixed");

  /** Load extension URL */
  window.electron.ipcRenderer
    .invoke("setup-session", { partition, extensionPath, proxyOptions })
    .then(({ extension, preload }) => {
      webview.preload = preload;
      webview.src = extension
        ? extension.url + "index.html"
        : import.meta.env.VITE_DEFAULT_WEBVIEW_URL;
    })
    .catch(() => {
      webview.src = import.meta.env.VITE_DEFAULT_WEBVIEW_URL;
    });

  return webview;
}

export function matchesSearch(search, item) {
  const user = item.telegramInitData
    ? extractInitDataUnsafe(item.telegramInitData)["user"]
    : null;

  const fullName = user ? getTelegramUserFullName(user) : "";
  const username = user?.["username"] || "";
  const userId = user?.["id"] || "";

  return (
    searchIncludes(item.title, search) ||
    searchIncludes(fullName, search) ||
    searchIncludes(username, search) ||
    searchIncludes(userId, search)
  );
}

import {
  HiOutlineArrowLeft,
  HiOutlineArrowPath,
  HiOutlineArrowRight,
  HiOutlineXMark,
} from "react-icons/hi2";
import { getWhiskerData, registerWebviewMessage } from "../lib/partitions";
import { memo, useEffect } from "react";

import { BsPinAngle } from "react-icons/bs";
import { RiPushpin2Fill } from "react-icons/ri";
import WebviewButton from "./WebviewButton";
import { cn } from "../lib/utils";
import useAppStore from "../store/useAppStore";
import useRefCallback from "../hooks/useRefCallback";
import useSettingsStore from "../store/useSettingsStore";
import useWebviewControls from "../hooks/useWebviewControls";

export default memo(function ({ browser, account, pinned, togglePinned }) {
  const updateAccount = useAppStore((state) => state.updateAccount);
  const theme = useSettingsStore((state) => state.theme);
  const allowProxies = useSettingsStore((state) => state.allowProxies);
  const extensionPath = useSettingsStore((state) => state.extensionPath);
  const showWebviewToolbar = useSettingsStore(
    (state) => state.showWebviewToolbar,
  );
  const { partition } = account;
  const {
    ref,
    isReady,
    isLoading,
    goBack,
    goForward,
    reload,
    stop,
    callWebviewMethod,
  } = useWebviewControls();

  /** Get Current Whisker Data */
  const getCurrentWhiskerData = useRefCallback(
    () =>
      getWhiskerData({
        account,
        settings: {
          allowProxies,
          theme,
        },
      }),
    [account, allowProxies, theme],
  );

  /** Send Whisker Data */
  const sendWhiskerData = useRefCallback(() => {
    callWebviewMethod((webview) =>
      webview.send("host-message", {
        action: "set-whisker-data",
        data: getCurrentWhiskerData(),
      }),
    );
  }, [getCurrentWhiskerData, callWebviewMethod]);

  /** Request the active account's telegram init data from the extension, so
   * profile picture/username show up even when the account was added in the
   * host app and the extension only captured the data after launch. */
  const requestAccountData = useRefCallback(() => {
    callWebviewMethod((webview) =>
      webview.send("host-message", {
        action: "get-account-data",
      }),
    );
  }, [callWebviewMethod]);

  /** Update Proxy */
  const updateProxy = useRefCallback(
    (data) => {
      updateAccount({
        ...account,
        ...data,
      });
    },
    [account, updateAccount],
  );

  /** Update Telegram InitData */
  const updateTelegramInitData = useRefCallback(
    (data) => {
      updateAccount({
        ...account,
        ...data,
      });
    },
    [account, updateAccount],
  );

  /** Setup Webview */
  useEffect(() => {
    const webview = ref.current;

    window.electron.ipcRenderer
      .invoke("setup-session", {
        partition,
        extensionPath,
      })
      .then(({ extension, preload }) => {
        webview.preload = preload;
        webview.src = extension
          ? extension.url + "index.html"
          : import.meta.env.VITE_DEFAULT_WEBVIEW_URL;
      })
      .catch(() => {
        webview.src = import.meta.env.VITE_DEFAULT_WEBVIEW_URL;
      });
  }, [partition, extensionPath]);

  /** Register Core Events */
  useEffect(() => {
    const webview = ref.current;

    /** IPC Message */
    registerWebviewMessage(webview, {
      "get-whisker-data": () => {
        sendWhiskerData();
        requestAccountData();
      },
      "set-proxy": (data) => updateProxy(data),
      "set-proxy-country": (data) => updateProxy(data),
      "set-telegram-init-data": (data) => updateTelegramInitData(data),
      "response-get-account-data": (data) => updateTelegramInitData(data),
    });
  }, [updateProxy, updateTelegramInitData, sendWhiskerData, requestAccountData]);

  /** Send Whisker Data */
  useEffect(() => {
    sendWhiskerData();
  }, [account, allowProxies, theme]);

  return (
    <div
      className={cn(
        "grow flex flex-col shrink-0",
        "divide-y dark:divide-neutral-700",
      )}
    >
      {/* Webiew Tag */}
      <webview
        allowpopups="true"
        className="grow"
        partition={partition}
        disablewebsecurity={"true"}
        webpreferences="webSecurity=no"
        ref={ref}
      />

      {/* Controls */}
      {showWebviewToolbar ? (
        <div className="p-2 flex shrink-0 justify-center gap-1">
          <div className="flex gap-1">
            {/* Pin Toggle */}
            <WebviewButton
              title="Toggle Pin"
              onClick={togglePinned}
              className={pinned && "text-nile-gold"}
            >
              {pinned ? (
                <RiPushpin2Fill className="size-4" />
              ) : (
                <BsPinAngle className="size-4" />
              )}
            </WebviewButton>

            {/* Back */}
            <WebviewButton title="Go Back" onClick={goBack}>
              <HiOutlineArrowLeft className="size-4" />
            </WebviewButton>

            {/* Forward */}
            <WebviewButton title="Go Forward" onClick={goForward}>
              <HiOutlineArrowRight className="size-4" />
            </WebviewButton>

            {/* Stop */}
            {isLoading ? (
              <WebviewButton onClick={stop} title="Stop">
                <HiOutlineXMark className="size-4" />
              </WebviewButton>
            ) : (
              <WebviewButton onClick={reload} title="Refresh">
                <HiOutlineArrowPath className="size-4" />
              </WebviewButton>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
});

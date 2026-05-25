import { HiOutlineGlobeAlt, HiOutlineXCircle } from "react-icons/hi2";
import { MdOutlineEditNote, MdOutlineFullscreen } from "react-icons/md";
import { memo, useCallback, useEffect, useId, useRef, useState } from "react";

import Browser from "./Browser";
import { Dialog } from "radix-ui";
import Draggable from "react-draggable";
import EditAccountDialogContent from "./EditAccountDialogContent";
import FarmerWebview from "./FarmerWebview";
import WebviewButton from "./WebviewButton";
import { cn } from "../lib/utils";
import { configureProxy } from "../lib/partitions";
import { useAppContext } from "../providers/AppProvider";
import useAppStore from "../store/useAppStore";
import useBrowser from "../hooks/useBrowser";
import useDialogState from "../hooks/useDialogState";
import useSettingsStore from "../store/useSettingsStore";

export default memo(function Webview({ account, pageIndex }) {
  const dragHandleClass = "draggable-handle-" + useId();
  const { currentPage, itemsPerPage } = useAppContext();
  const rows = useSettingsStore((state) => state.rows);

  const {
    title,
    partition,
    proxyEnabled,
    proxyHost,
    proxyPort,
    proxyUsername,
    proxyPassword,
  } = account;

  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState({
    x: 0,
    y: 0,
  });
  const browser = useBrowser(partition);
  const containerRef = useRef();
  const [isDesktop, setIsDesktop] = useState(false);
  const allowProxies = useSettingsStore((state) => state.allowProxies);
  const closeAccount = useAppStore((state) => state.closeAccount);

  const pinnedTranslation = (currentPage - pageIndex) * rows * 100;

  /** Edit Account Dialog State */
  const {
    opened: openEditAccountDialog,
    setOpened: setOpenEditAccountDialog,
    closeDialog: closeEditAccountDialog,
  } = useDialogState();

  /** Toggle FullScreen */
  const toggleFullScreen = useCallback(() => {
    const container = containerRef.current;
    if (!document.fullscreenElement) {
      if (container) {
        container.requestFullscreen();
      }
    } else if (document.fullscreenElement === container) {
      document.exitFullscreen();
    }
  }, []);

  const togglePinned = () => {
    setPinned((prev) => !prev);
    setPosition({
      x: 0,
      y: 0,
    });
  };

  /** Configure Proxy */
  useEffect(() => {
    configureProxy(partition, {
      allowProxies,
      proxyEnabled,
      proxyHost,
      proxyPort,
      proxyUsername,
      proxyPassword,
    });
  }, [
    partition,
    allowProxies,
    proxyEnabled,
    proxyHost,
    proxyPort,
    proxyUsername,
    proxyPassword,
    configureProxy,
  ]);

  /** Watch Fullscreen */
  useEffect(() => {
    const handleFullscreenChange = () =>
      setIsDesktop(document.fullscreenElement === containerRef.current);

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [setIsDesktop]);

  return (
    <div className="grow flex flex-col relative">
      {pinned && (
        <div className="grow flex flex-col gap-2 justify-center items-center p-4">
          <h1 className="text-xl text-orange-500 max-w-full truncate">
            {title}
          </h1>
          <p>This account is currently pinned</p>
        </div>
      )}
      <div
        className={cn(
          "grow flex flex-col",
          pinned
            ? [
                "transition-transform duration-500",
                "translate-y-(--pinned-translation)",
                "z-999 absolute inset-0",
                "pointer-events-none",
              ]
            : null,
        )}
        style={{
          "--pinned-translation": pinned ? `${pinnedTranslation}%` : 0,
        }}
      >
        <Draggable
          handle={`.${dragHandleClass}`}
          disabled={!pinned}
          nodeRef={containerRef}
          position={position}
          onDrag={(e, { x, y }) =>
            setPosition({
              x,
              y,
            })
          }
        >
          <div
            ref={containerRef}
            className={cn(
              "grow flex flex-col shrink-0",
              "divide-y dark:divide-neutral-700",
              "bg-white dark:bg-neutral-800 dark:text-white",
              pinned
                ? ["border border-orange-500", "pointer-events-auto"]
                : null,
            )}
          >
            <div className="flex justify-between px-2">
              <div className="flex gap-1 py-2">
                {/* Toggle Browser */}
                <WebviewButton
                  title="Toggle Browser"
                  onClick={browser.toggle}
                  className={browser.shown && "text-orange-500"}
                >
                  <HiOutlineGlobeAlt className="size-4" />
                </WebviewButton>

                {/* Toggle Fullscreen */}
                <WebviewButton
                  title="Toggle Fullscreen"
                  onClick={toggleFullScreen}
                  className={isDesktop && "text-orange-500"}
                >
                  <MdOutlineFullscreen className="size-4" />
                </WebviewButton>
              </div>

              {/* Title */}
              <div
                role="button"
                className={cn(
                  "flex justify-center items-center grow min-w-0 px-2",
                  dragHandleClass,
                )}
              >
                <h1
                  title={title}
                  className={cn(
                    "text-orange-500 truncate font-bold text-center grow min-w-0",
                  )}
                >
                  {title}
                </h1>
              </div>

              <div className="flex gap-1 py-2">
                {/* Edit Dialog */}
                <Dialog.Root
                  open={openEditAccountDialog}
                  onOpenChange={setOpenEditAccountDialog}
                >
                  {/* Edit Button */}
                  <Dialog.Trigger
                    disabled={isDesktop}
                    asChild
                    title="Edit Account"
                  >
                    <WebviewButton>
                      <MdOutlineEditNote className="size-4" />
                    </WebviewButton>
                  </Dialog.Trigger>

                  {/* Account Dialog */}
                  <EditAccountDialogContent
                    account={account}
                    close={closeEditAccountDialog}
                  />
                </Dialog.Root>

                {/* Close Button */}
                <WebviewButton
                  title="Close Account"
                  onClick={() => closeAccount(partition)}
                >
                  <HiOutlineXCircle className="size-4" />
                </WebviewButton>
              </div>
            </div>

            {/* Farmer and Browser */}
            <div className="grow flex flex-col overflow-hidden">
              <div
                className={cn(
                  "-translate-x-(--translate) translate-3d",
                  "grow grid w-[200%] gap-0  grid-cols-2",
                  "transition-transform duration-500",
                )}
                style={{
                  "--translate": browser.shown ? "50%" : "0%",
                }}
              >
                {/* Farmer Webview */}
                <FarmerWebview
                  pinned={pinned}
                  togglePinned={togglePinned}
                  browser={browser}
                  account={account}
                />

                {/* Browser */}
                {browser.enabled ? (
                  <Browser
                    browser={browser}
                    account={account}
                    isDesktop={isDesktop}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </Draggable>
      </div>
    </div>
  );
});

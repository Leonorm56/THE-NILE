import { cn, uuid } from "../lib/utils";
import { memo, useCallback, useRef } from "react";

import BrowserTab from "./BrowserTab";
import { HiOutlinePlus } from "react-icons/hi2";
import { TabButton } from "./TabButton";
import WebviewButton from "./WebviewButton";

const INITIAL_URL = import.meta.env.VITE_DEFAULT_WEBVIEW_URL;

/** Get new tab */
const getNewTab = () => ({
  id: uuid(),
  active: true,
  title: "New Tab",
  url: import.meta.env.VITE_DEFAULT_WEBVIEW_URL,
});

export default memo(function Browser({ browser, account, isDesktop }) {
  const tabButtonsContainerRef = useRef();
  const { tabs, addTab, closeTab, setActiveTab, updateTitle, updateIcon } =
    browser;

  /** Scroll to Tab Button */
  const scrollToTabButton = useCallback((element) => {
    const container = tabButtonsContainerRef.current;

    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    const offsetLeft =
      elementRect.left - containerRect.left + container.scrollLeft;
    const targetScrollLeft =
      offsetLeft - container.clientWidth / 2 + element.offsetWidth / 2;

    container.scrollTo({ left: targetScrollLeft, behavior: "smooth" });
  }, []);

  return (
    <div className="grow flex flex-col">
      <div
        ref={tabButtonsContainerRef}
        className={cn(
          "w-full relative z-0",
          "flex items-center shrink-0 py-1 pr-2",
          "overflow-x-scroll scrollbar-thin",
        )}
      >
        {/* Main */}
        <div className="sticky left-0 py-1 px-2 bg-white z-1 dark:bg-neutral-800 shrink-0">
          <WebviewButton onClick={addTab}>
            <HiOutlinePlus className="size-4" />
          </WebviewButton>
        </div>

        {/* Tab Buttons */}
        <div className="flex gap-1 flex-nowrap shrink-0">
          {tabs.map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              setActiveTab={setActiveTab}
              closeTab={closeTab}
              scrollToTabButton={scrollToTabButton}
            />
          ))}
        </div>
      </div>

      <div className="relative grow">
        {tabs.map((item) => (
          <div
            key={item.id}
            className={cn(
              "absolute inset-0 flex flex-col",
              !item.active && "invisible",
            )}
          >
            <BrowserTab
              id={item.id}
              url={item.url}
              isDesktop={isDesktop}
              partition={account.partition}
              addTab={addTab}
              closeTab={closeTab}
              updateTitle={updateTitle}
              updateIcon={updateIcon}
            />
          </div>
        ))}
      </div>
    </div>
  );
});

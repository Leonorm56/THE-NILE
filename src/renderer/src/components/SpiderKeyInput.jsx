import Input from "./Input";
import { cn } from "../lib/utils";
import toast from "react-hot-toast";
import useAppStore from "../store/useAppStore";
import { useState } from "react";

export default function SpiderKeyInput() {
  const spiderApiKey = useAppStore((state) => state.spiderApiKey);
  const setSpiderApiKey = useAppStore((state) => state.setSpiderApiKey);

  const [tempApiKey, setTempApiKey] = useState(spiderApiKey || "");

  const handleSave = () => {
    setSpiderApiKey(tempApiKey);
    toast.success("Spider API Key saved!");
  };

  return (
    <>
      <div className="flex gap-2">
        <Input
          value={tempApiKey}
          onChange={(e) => setTempApiKey(e.target.value)}
          label="Spider API Key"
          placeholder="Enter your Spider API Key"
        />

        <button
          className={cn(
            "px-4 bg-orange-500 text-white rounded-lg hover:bg-orange-600",
            "shrink-0 rounded-xl font-bold",
          )}
          onClick={handleSave}
        >
          Save
        </button>
      </div>
      <p className="text-neutral-500 dark:text-neutral-400 text-center">
        Get your Spider API Key from the{" "}
        <a
          href="https://t.me/S_PIDERRBot?start=1147265290"
          target="_blank"
          rel="noopener noreferrer"
          className="text-orange-500"
        >
          Spider Bot
        </a>
        .
      </p>
    </>
  );
}

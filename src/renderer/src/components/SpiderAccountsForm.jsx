import { HiOutlineArrowLeft, HiOutlineCurrencyDollar } from "react-icons/hi2";

import Input from "./Input";
import LabelToggle from "./LabelToggle";
import { NumberInput } from "./NumberInput";
import PrimaryButton from "./PrimaryButton";
import { Progress } from "./Progress";
import Slider from "./Slider";
import { useSpider } from "./SpiderProvider";

export default function SpiderAccountsForm({ country, clearSelection }) {
  const { form } = useSpider();
  const {
    /** Container ref */
    containerRef,

    /** Count */
    count,
    setCount,

    /** Batch */
    batch,
    setBatch,

    /** Password */
    password,
    setPassword,

    /** Local telegram session */
    enableLocalTelegramSession,
    setEnableLocalTelegramSession,

    /** Mutation */
    mutation,
    progress,
    totalPrice,
    purchaseAccounts,
  } = form;

  return (
    <>
      {/* Webview Containers */}
      <div ref={containerRef}></div>

      {/* Country Information */}
      <h2 className="text-lg flex justify-center items-center gap-2 text-orange-500 font-bold">
        <span>{country.emoji}</span>
        {country.name} ({country.code})
      </h2>

      {/* Country Price */}
      <div className="flex flex-col gap-1">
        <p className="text-center text-sky-500 dark:text-sky-300 font-bold">
          ${country.price} (Per Account)
        </p>

        <p className="text-center text-purple-500 dark:text-purple-300 font-bold">
          Total: ${totalPrice}
        </p>
      </div>

      {/* Return to Countries */}
      <button
        onClick={clearSelection}
        className="flex justify-center items-center gap-2 text-sm text-orange-500 hover:underline"
      >
        <HiOutlineArrowLeft className="size-4" /> Return to Countries
      </button>

      {/* Number of Accounts */}
      <NumberInput
        label="Number of Accounts"
        value={count}
        onChange={setCount}
        readOnly={false}
        disabled={mutation.isPending}
      />

      {/* Batch */}
      <div className="flex flex-col">
        <label className="text-orange-500 text-center">
          Batch: <span className="font-bold">{batch}</span>
        </label>
        <Slider
          step={1}
          min={1}
          max={3}
          value={[batch]}
          onValueChange={(value) => setBatch(value[0])}
        />
      </div>

      {/* Enable Local Telegram Session */}
      <LabelToggle
        onChange={(ev) => setEnableLocalTelegramSession(ev.target.checked)}
        checked={enableLocalTelegramSession}
        disabled={mutation.isPending}
      >
        Enable Local Telegram Session
      </LabelToggle>

      {/* 2FA */}
      <Input
        placeholder="2FA (Optional)"
        value={password}
        disabled={mutation.isPending}
        onChange={(e) => setPassword(e.target.value)}
      />

      {/* 2FA Information */}
      <p className="text-center text-neutral-500 dark:text-neutral-400 px-2">
        Leave empty if you do not want to change the 2FA password of the new
        accounts.
      </p>

      {/* Purchase Button */}
      <PrimaryButton onClick={purchaseAccounts} disabled={mutation.isPending}>
        <HiOutlineCurrencyDollar className="size-5" />
        {mutation.isPending ? "Purchasing..." : "Purchase Accounts"}
      </PrimaryButton>

      {/* Progress */}
      {mutation.isPending && <Progress current={progress} max={count} />}
    </>
  );
}

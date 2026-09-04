import {
  HiOutlineArrowLeft,
  HiOutlineCurrencyDollar,
  HiXMark,
} from "react-icons/hi2";

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
    maxCount,
    cancelPurchase,
    purchaseAccounts,
  } = form;

  /** Exceeds available stock */
  const exceedsStock = count > maxCount;

  return (
    <>
      {/* Webview Containers */}
      <div ref={containerRef}></div>

      {/* Country Information */}
      <h2 className="text-lg flex justify-center items-center gap-2 text-nile-gold font-bold">
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

        <p className="text-center text-emerald-500 dark:text-emerald-300 font-bold">
          {maxCount} available
        </p>
      </div>

      {/* Return to Countries */}
      <button
        onClick={clearSelection}
        className="flex justify-center items-center gap-2 text-sm text-nile-gold hover:underline"
      >
        <HiOutlineArrowLeft className="size-4" /> Return to Countries
      </button>

      {/* Number of Accounts */}
      <NumberInput
        label="Number of Accounts"
        value={count}
        onChange={(value) => {
          const parsed = parseInt(value) || 1;
          setCount(Math.max(1, Math.min(parsed, maxCount)));
        }}
        readOnly={false}
        disabled={mutation.isPending}
      />

      {/* Batch */}
      <div className="flex flex-col">
        <label className="text-nile-gold text-center">
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
      <PrimaryButton
        onClick={purchaseAccounts}
        disabled={mutation.isPending || exceedsStock}
      >
        <HiOutlineCurrencyDollar className="size-5" />
        {mutation.isPending ? "Purchasing..." : "Purchase Accounts"}
      </PrimaryButton>

      {/* Progress */}
      {mutation.isPending && <Progress current={progress} max={count} />}

      {/* Cancel button */}
      {mutation.isPending ? (
        <button
          onClick={cancelPurchase}
          className="p-2 text-red-500 inline-flex justify-center items-center gap-2"
        >
          <HiXMark className="size-5" />
          Cancel operation
        </button>
      ) : null}
    </>
  );
}

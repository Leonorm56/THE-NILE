import ShockedCat from "../assets/images/shocked-cat.png?format=webp";
import { memo } from "react";
import PrimaryButton from "./PrimaryButton";

export default memo(function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div
      role="alert"
      className="min-h-dvh max-w-md mx-auto p-4 flex flex-col gap-2 justify-center items-center"
    >
      {/* Image */}
      <img src={ShockedCat} className="h-28" />

      {/* Prompt */}
      <h4 className="text-3xl font-turret-road text-orange-500">
        Cat-astrophe!
      </h4>

      {/* Message */}
      <p className="w-full max-w-xs p-4 text-center text-red-800 bg-red-100 rounded-lg">
        {error?.message || "Something went wrong"}
      </p>

      {/* Reset Button */}
      <PrimaryButton
        onClick={resetErrorBoundary}
        className="w-full max-w-xs px-4 py-2 text-white bg-orange-500 rounded-lg"
      >
        Reset
      </PrimaryButton>
    </div>
  );
});

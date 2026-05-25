import { forwardRef, memo } from "react";

import { Slider as SliderPrimitive } from "radix-ui";
import { cn } from "../lib/utils";

const Slider = forwardRef(
  (
    { trackClassName, rangeClassName, thumbClassName, ...props },
    forwardedRef,
  ) => {
    const value = props.value || props.defaultValue;

    return (
      <SliderPrimitive.Slider
        {...props}
        ref={forwardedRef}
        className={cn(
          "relative flex items-center select-none touch-none",
          "w-full h-4",
        )}
      >
        <SliderPrimitive.Track
          className={cn(
            "relative h-1 bg-orange-200 rounded-full grow",
            trackClassName,
          )}
        >
          <SliderPrimitive.Range
            className={cn(
              "absolute h-full bg-orange-500 rounded-full",
              rangeClassName,
            )}
          />
        </SliderPrimitive.Track>
        {value.map((_, i) => (
          <SliderPrimitive.Thumb
            key={i}
            className={cn(
              "relative size-4 rounded-full",
              "flex items-center justify-center text-xs",
              "bg-orange-500 shadow-xs",
              "border-4 border-white",
              "focus:outline-hidden",
              thumbClassName,
            )}
          />
        ))}
      </SliderPrimitive.Slider>
    );
  },
);

export default memo(Slider);

import { HiOutlineChevronUp, HiOutlineChevronDown } from "react-icons/hi2";
import Input from "./Input";
import { NumberInputButton } from "./NumberInputButton";

export const NumberInput = ({
  value,
  label,
  onChange,
  disabled,
  readOnly = true,
}) => (
  <div className="flex gap-2">
    <div className="flex flex-col-reverse gap-2 grow min-w-0">
      <label className="text-orange-500">{label}</label>
      <Input
        type="number"
        min="1"
        value={value}
        readOnly={readOnly}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
    <div className="flex flex-col gap-1 shrink-0">
      <NumberInputButton
        disabled={disabled}
        onClick={() => onChange(parseInt(value) + 1)}
      >
        <HiOutlineChevronUp className="size-4 stroke-3" />
      </NumberInputButton>
      <NumberInputButton
        disabled={disabled}
        onClick={() => onChange(parseInt(value) - 1)}
      >
        <HiOutlineChevronDown className="size-4 stroke-3" />
      </NumberInputButton>
    </div>
  </div>
);

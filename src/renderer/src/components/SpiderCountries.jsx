import { FaSortAmountDown, FaSortAmountUp } from "react-icons/fa";

import { cn } from "../lib/utils";
import IconButton from "./IconButton";
import Input from "./Input";
import Select from "./Select";

export default function SpiderCountries({
  selectCountry,
  filteredCountries,
  searchTerm,
  setSearchTerm,
  sortKey,
  setSortKey,
  sortDir,
  setSortDir,
}) {
  const toggleSortDir = () =>
    setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));

  return (
    <div className="flex flex-col gap-2">
      <h2 className="col-span-full font-bold text-center">All Countries</h2>
      <Input
        type="search"
        placeholder="Search countries..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <Select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
          <option value="name">Sort by Name</option>
          <option value="price">Sort by Price</option>
        </Select>
        <IconButton
          onClick={toggleSortDir}
          title={sortDir === "asc" ? "Ascending" : "Descending"}
        >
          {sortDir === "asc" ? <FaSortAmountUp /> : <FaSortAmountDown />}
        </IconButton>
      </div>
      <div className="max-h-96 overflow-auto -mx-2 p-2">
        <div className="flex flex-col gap-2">
          {filteredCountries.map((item, index) => (
            <button
              key={index}
              onClick={() => selectCountry(item)}
              className={cn(
                "flex items-center gap-2",
                "p-2.5 text-left rounded-xl",
                "bg-neutral-100 dark:bg-neutral-700",
                "hover:bg-neutral-200 dark:hover:bg-neutral-600"
              )}
            >
              <span>{item.emoji}</span>
              <span className="flex-1 font-bold truncate">{item.name}</span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                {item.quantity} left
              </span>
              <span className="font-bold text-nile-gold">${item.price}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

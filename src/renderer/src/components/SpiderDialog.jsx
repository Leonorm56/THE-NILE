import AppDialogContent from "./AppDialogContent";
import { Dialog } from "radix-ui";
import { FaSpider } from "react-icons/fa";
import SpiderAccountsForm from "./SpiderAccountsForm";
import SpiderBalanceDisplay from "./SpiderBalanceDisplay";
import SpiderCountries from "./SpiderCountries";
import SpiderKeyInput from "./SpiderKeyInput";
import { cn } from "../lib/utils";
import { useSpider } from "./SpiderProvider";

export default function SpiderDialog() {
  const { core } = useSpider();
  const {
    enabled,
    balance,
    balanceQuery,
    spiderApiKey,
    searchTerm,
    setSearchTerm,
    selectedCountry,
    setSelectedCountry,
    countriesQuery,
    allCountries,
    availableCountries,
    filteredCountries,
    selectCountry,
  } = core;

  return (
    <AppDialogContent
      title={"Spider"}
      description={"Purchase accounts in bulk from Spider."}
      icon={FaSpider}
    >
      <SpiderKeyInput />

      {spiderApiKey ? (
        <>
          <SpiderBalanceDisplay query={balanceQuery} />
          {selectedCountry ? (
            <SpiderAccountsForm
              country={selectedCountry}
              clearSelection={() => setSelectedCountry(null)}
            />
          ) : (
            <>
              {countriesQuery.isSuccess ? (
                <SpiderCountries
                  selectCountry={selectCountry}
                  filteredCountries={filteredCountries}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                />
              ) : countriesQuery.isPending ? (
                <p className="text-center">Loading countries...</p>
              ) : null}
              {/* Close Dialog */}
              <Dialog.Close
                className={cn(
                  "px-4 py-2.5 text-orange-500 border border-orange-500 rounded-xl",
                  "font-bold",
                )}
              >
                Close
              </Dialog.Close>
            </>
          )}
        </>
      ) : null}
    </AppDialogContent>
  );
}

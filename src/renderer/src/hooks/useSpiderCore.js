import { useMemo, useState } from "react";

import Spider from "../lib/Spider";
import { getCountryData } from "countries-list";
import { getEmojiFlag } from "countries-list";
import toast from "react-hot-toast";
import useAppStore from "../store/useAppStore";
import { useQuery } from "@tanstack/react-query";

const useSpiderCore = () => {
  const spiderApiKey = useAppStore((state) => state.spiderApiKey);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [selectedCountry, setSelectedCountry] = useState(null);

  /** Enabled */
  const enabled = Boolean(spiderApiKey);

  /* Balance Query */
  const balanceQuery = useQuery({
    queryKey: ["spider-balance", spiderApiKey],
    queryFn: async () => {
      return new Spider(spiderApiKey).getBalance();
    },
    refetchInterval: 60_000,
    enabled,
  });

  /* Balance */
  const balance = balanceQuery.data?.wallet || 0;

  /* Countries Query */
  const countriesQuery = useQuery({
    queryKey: ["spider-countries", spiderApiKey],
    queryFn: async () => {
      return new Spider(spiderApiKey).getCountries();
    },
    refetchInterval: 60_000,
    enabled,
  });

  /* All Countries */
  const allCountries = useMemo(() => {
    try {
      if (!countriesQuery.data) return [];

      /* Quantities are returned under the misspelled "cuantity" key */
      const quantities =
        countriesQuery.data.cuantity || countriesQuery.data.quantity || {};

      return Object.entries(countriesQuery.data.countries).reduce(
        (result, [group, list]) =>
          result.concat(
            Object.entries(list).map(([code, price]) => {
              const country = getCountryData(code);
              const emoji = getEmojiFlag(code);
              const name = country?.name || code;
              const quantity = quantities?.[group]?.[code] ?? 0;
              return {
                code,
                price: parseFloat(price),
                quantity,
                emoji,
                name,
                group,
              };
            }),
          ),
        [],
      );
    } catch (e) {
      console.error("Error processing countries:", e);
      return [];
    }
  }, [countriesQuery.data]);

  /* Available Countries (Group 1) */
  const availableCountries = useMemo(() => {
    return allCountries.filter((item) => item.group === "1");
  }, [allCountries]);

  /* Filtered & Sorted Countries */
  const filteredCountries = useMemo(() => {
    const term = searchTerm.toLowerCase();
    const direction = sortDir === "desc" ? -1 : 1;

    return availableCountries
      .filter((item) => item.name.toLowerCase().includes(term))
      .sort((a, b) => {
        const comparison =
          sortKey === "price"
            ? a.price - b.price
            : a.name.localeCompare(b.name);
        return comparison * direction;
      });
  }, [availableCountries, searchTerm, sortKey, sortDir]);

  /** Select Country */
  const selectCountry = (item) => {
    if (item.quantity <= 0) {
      toast.error("This country is out of stock.");
      return;
    }
    if (item.price > balance) {
      toast.error("Insufficient balance for this country.");
      return;
    }
    setSelectedCountry(item);
  };

  return {
    spiderApiKey,
    searchTerm,
    setSearchTerm,
    sortKey,
    setSortKey,
    sortDir,
    setSortDir,

    selectedCountry,
    setSelectedCountry,

    enabled,
    balance,
    balanceQuery,
    countriesQuery,
    allCountries,
    availableCountries,
    filteredCountries,
    selectCountry,
  };
};

export { useSpiderCore };

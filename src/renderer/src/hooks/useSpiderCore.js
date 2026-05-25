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
      return countriesQuery.data
        ? Object.entries(countriesQuery.data.countries).reduce(
            (result, [group, list]) =>
              result.concat(
                Object.entries(list).map(([code, price]) => {
                  const country = getCountryData(code);
                  const emoji = getEmojiFlag(code);
                  const name = country?.name || code;
                  return {
                    code,
                    price: parseFloat(price),
                    emoji,
                    name,
                    group,
                  };
                }),
              ),
            [],
          )
        : [];
    } catch (e) {
      console.error("Error processing countries:", e);
      return [];
    }
  }, [countriesQuery.data]);

  /* Available Countries (Group 1) */
  const availableCountries = useMemo(() => {
    return allCountries
      .filter((item) => item.group === "1")
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allCountries]);

  /* Filtered Countries */
  const filteredCountries = useMemo(() => {
    return availableCountries.filter((item) =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [availableCountries, searchTerm]);

  /** Select Country */
  const selectCountry = (item) => {
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

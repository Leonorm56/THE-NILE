import { createContext, useContext } from "react";

import { useSpiderAccountsForm } from "../hooks/useSpiderAccountsForm";
import { useSpiderCore } from "../hooks/useSpiderCore";

const SpiderContext = createContext();

export const SpiderProvider = ({ children }) => {
  const core = useSpiderCore();
  const form = useSpiderAccountsForm({
    country: core.selectedCountry,
  });

  return (
    <SpiderContext.Provider value={{ core, form }}>
      {children}
    </SpiderContext.Provider>
  );
};

export const useSpider = () => useContext(SpiderContext);

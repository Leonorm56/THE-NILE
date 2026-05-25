import { useCallback, useState } from "react";

export default function useAccountsSelector(accounts) {
  const [selectedAccounts, setSelectedAccounts] = useState(accounts);
  const allSelected = selectedAccounts.length === accounts.length;

  const toggleAccount = useCallback((account, checked) => {
    if (checked) {
      setSelectedAccounts((prev) => [...prev, account]);
    } else {
      setSelectedAccounts((prev) =>
        prev.filter((item) => item.partition !== account.partition),
      );
    }
  }, []);

  const toggleAllAccounts = useCallback(
    (checked) => {
      setSelectedAccounts(checked ? accounts : []);
    },
    [accounts],
  );

  return {
    accounts,
    allSelected,
    selectedAccounts,
    setSelectedAccounts,
    toggleAccount,
    toggleAllAccounts,
  };
}

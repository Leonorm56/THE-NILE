import { combine, createJSONStorage, persist } from "zustand/middleware";

import { create } from "zustand";
import { storage } from "./storage";
import useSettingsStore from "./useSettingsStore";

export default create(
  persist(
    combine(
      {
        page: 0,
        accounts: [],
        tags: [],
        spiderApiKey: null,
      },
      (set, get) => ({
        setPage: (page) => set({ page }),
        setSpiderApiKey: (key) => set({ spiderApiKey: key }),

        addAccount: (data) => set({ accounts: [...get().accounts, data] }),
        importAccounts: (data) => {
          const existing = get().accounts;
          const filtered = data.filter(
            (item) =>
              !existing.some((account) => account.partition === item.partition),
          );

          return set({ accounts: [...existing, ...filtered] });
        },
        setAccounts: (accounts) => set({ accounts }),
        updateAccount: (data) =>
          set({
            accounts: get().accounts.map((item) =>
              item.partition === data.partition ? { ...item, ...data } : item,
            ),
          }),
        removeAccount: (partition) =>
          set({
            accounts: get().accounts.filter(
              (item) => item.partition !== partition,
            ),
          }),

        closeAccount: (partition) =>
          set({
            accounts: get().accounts.map((item) =>
              item.partition === partition ? { ...item, running: false } : item,
            ),
          }),

        closeAllAccounts: () =>
          set({
            accounts: get().accounts.map((item) => ({
              ...item,
              running: false,
            })),
          }),

        closePage: (pageIndex) => {
          const { accounts } = get();
          const { columns, rows } = useSettingsStore.getState();
          const itemsPerPage = columns * rows;

          const partitions = accounts
            .filter((item) => item.running)
            .filter(
              (_, index) => pageIndex === Math.floor(index / itemsPerPage),
            )
            .map((item) => item.partition);

          set({
            accounts: accounts.map((item) =>
              partitions.includes(item.partition)
                ? { ...item, running: false }
                : item,
            ),
          });
        },

        launchAccount: (partition) => {
          const { accounts } = get();
          const { columns, rows } = useSettingsStore.getState();
          const itemsPerPage = columns * rows;

          const isRunning = accounts.some(
            (item) => item.partition === partition && item.running,
          );

          const newAccounts = isRunning
            ? accounts
            : accounts.map((item) =>
                item.partition === partition
                  ? { ...item, running: true }
                  : item,
              );

          const index = newAccounts
            .filter((item) => item.running)
            .findIndex((item) => item.partition === partition);
          const pageIndex = Math.floor(index / itemsPerPage);

          set({ accounts: newAccounts, page: pageIndex });
        },

        /** Tags */
        addTag: (tag) => set({ tags: [...get().tags, tag] }),
        removeTag: (id) =>
          set({
            tags: get().tags.filter((item) => item.id !== id),
            accounts: get().accounts.map((account) => ({
              ...account,
              tags: account.tags?.filter?.((tagId) => tagId !== id),
            })),
          }),
        updateTag: (id, name) =>
          set({
            tags: get().tags.map((item) =>
              item.id === id ? { ...item, name } : item,
            ),
          }),
        setTags: (tags) => set({ tags }),
      }),
    ),
    {
      name: "app-store", // unique name
      storage: createJSONStorage(() => storage),
    },
  ),
);

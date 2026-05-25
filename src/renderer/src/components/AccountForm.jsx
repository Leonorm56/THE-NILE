import * as changeCase from "change-case";
import * as yup from "yup";

import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import {
  Controller,
  FormProvider,
  useFieldArray,
  useForm,
} from "react-hook-form";
import { HiChevronDown, HiTag, HiXMark } from "react-icons/hi2";
import { memo, useState } from "react";

import Input from "./Input";
import LabelToggle from "./LabelToggle";
import { MdLightbulb } from "react-icons/md";
import PrimaryButton from "./PrimaryButton";
import { cn } from "../lib/utils";
import toast from "react-hot-toast";
import useAppStore from "../store/useAppStore";
import { yupResolver } from "@hookform/resolvers/yup";

const schema = yup
  .object({
    partition: yup.string().nullable(),
    telegramInitData: yup.string().nullable(),
    title: yup.string().required().label("Title"),
    proxyEnabled: yup.bool().required(),
    proxyHost: yup.string().nullable(),
    proxyPort: yup.string().nullable(),
    proxyUsername: yup.string().nullable(),
    proxyPassword: yup.string().nullable(),
    tags: yup.array().of(yup.string()).required().default([]),
  })
  .required();

const TagOption = (props) => (
  <ComboboxOption
    {...props}
    className={cn(
      "p-2 bg-neutral-100 dark:bg-neutral-800 rounded-xl cursor-pointer",
      "data-focus:bg-orange-500 data-focus:text-white group",
      "truncate flex items-center gap-2",
    )}
  >
    <HiTag
      className={cn(
        "size-4 shrink-0",
        "text-orange-500 group-data-active:text-white",
      )}
    />{" "}
    {props.children}
  </ComboboxOption>
);

export default memo(function AccountForm({ account, handleFormSubmit }) {
  const accounts = useAppStore((state) => state.accounts);
  const tags = useAppStore((state) => state.tags);
  const addTag = useAppStore((state) => state.addTag);

  /** Form */
  const form = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      partition: account?.partition || null,
      telegramInitData: account?.telegramInitData || null,
      title: account?.title || `Account ${accounts.length + 1}`,
      proxyEnabled:
        typeof account?.proxyEnabled !== "undefined"
          ? account?.proxyEnabled
          : false,
      proxyHost: account?.proxyHost || null,
      proxyPort: account?.proxyPort || null,
      proxyUsername: account?.proxyUsername || null,
      proxyPassword: account?.proxyPassword || null,
      tags: account?.tags || [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "tags",
    keyName: "fieldId",
  });
  const [query, setQuery] = useState("");
  const selectedTags = form.watch("tags");
  const filteredTags = tags.filter(
    (tag) =>
      !selectedTags?.includes(tag.id) &&
      tag.name.toLowerCase().includes(query.toLowerCase()),
  );

  const handleTagAdd = (tag) => {
    if (!tag) return;
    const name = tag.name.trim();
    if (name.length === 0) return;

    /* Create new tag object */
    const newTag = {
      id: changeCase.kebabCase(name),
      name,
    };

    /* Check if tag already exists */
    const existingTag = tags.find((item) => item.id === newTag.id);

    /* If tag doesn't exist, add it to the store */
    if (!existingTag) {
      addTag(newTag);
    }

    /* Check if tag is already selected */
    if (selectedTags.includes(newTag.id)) {
      toast.error("Tag already added");
    } else {
      append(newTag.id);
    }
  };

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(handleFormSubmit)}
        className="flex flex-col gap-2"
      >
        {/* Title */}
        <Controller
          name="title"
          render={({ field, fieldState }) => (
            <>
              <label className="text-neutral-500">Title</label>
              <Input {...field} autoComplete="off" placeholder="Title" />
              {fieldState.error?.message ? (
                <p className="text-red-500">{fieldState.error?.message}</p>
              ) : null}
            </>
          )}
        />

        {/* Enable Proxy */}
        <Controller
          name="proxyEnabled"
          render={({ field, fieldState }) => (
            <>
              <label className="text-orange-500 mt-2">Proxy Options</label>
              <LabelToggle onChange={field.onChange} checked={field.value}>
                Enable Proxy
              </LabelToggle>
              {fieldState.error?.message ? (
                <p className="text-red-500">{fieldState.error?.message}</p>
              ) : null}
            </>
          )}
        />

        <div className="grid grid-cols-2 gap-2">
          {/* Proxy Host */}
          <Controller
            name="proxyHost"
            render={({ field, fieldState }) => (
              <div className="flex flex-col gap-2">
                <label className="text-neutral-500">Proxy Host</label>
                <Input {...field} autoComplete="off" placeholder="Proxy Host" />
                {fieldState.error?.message ? (
                  <p className="text-red-500">{fieldState.error?.message}</p>
                ) : null}
              </div>
            )}
          />

          {/* Proxy Port */}
          <Controller
            name="proxyPort"
            render={({ field, fieldState }) => (
              <div className="flex flex-col gap-2">
                <label className="text-neutral-500">Proxy Port</label>
                <Input {...field} autoComplete="off" placeholder="Proxy Port" />
                {fieldState.error?.message ? (
                  <p className="text-red-500">{fieldState.error?.message}</p>
                ) : null}
              </div>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Proxy Username */}
          <Controller
            name="proxyUsername"
            render={({ field, fieldState }) => (
              <div className="flex flex-col gap-2">
                <label className="text-neutral-500">Proxy Username</label>
                <Input
                  {...field}
                  autoComplete="off"
                  placeholder="Proxy Username"
                />
                {fieldState.error?.message ? (
                  <p className="text-red-500">{fieldState.error?.message}</p>
                ) : null}
              </div>
            )}
          />

          {/* Proxy Password */}
          <Controller
            name="proxyPassword"
            render={({ field, fieldState }) => (
              <div className="flex flex-col gap-2">
                <label className="text-neutral-500">Proxy Password</label>
                <Input
                  {...field}
                  autoComplete="off"
                  placeholder="Proxy Password"
                />
                {fieldState.error?.message ? (
                  <p className="text-red-500">{fieldState.error?.message}</p>
                ) : null}
              </div>
            )}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-neutral-500">Tags</label>
          <div className="flex flex-wrap gap-2">
            {fields.map((tag, index) => (
              <Controller
                key={tag.fieldId}
                name={`tags.${index}`}
                render={({ field }) => (
                  <div
                    key={index}
                    className={cn(
                      "flex items-center gap-1",
                      "p-2",
                      "bg-neutral-100 dark:bg-neutral-700",
                      "rounded-xl",
                    )}
                  >
                    <HiTag className={cn("size-4", "text-orange-500")} />
                    {tags.find((item) => item.id === field.value)?.name ||
                      field.value}
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <HiXMark className="size-4" />
                    </button>
                  </div>
                )}
              />
            ))}
            <Combobox
              immediate
              as={"div"}
              className="relative"
              onClose={() => {
                setQuery("");
              }}
              onChange={handleTagAdd}
            >
              <div className="flex bg-neutral-100 dark:bg-neutral-700 rounded-xl p-1">
                <ComboboxInput
                  aria-label="Tag"
                  displayValue={(tag) => tag?.name}
                  className={cn("p-1 outline-0")}
                  placeholder="Add Tag"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />

                {/* Dropdown Button */}
                <ComboboxButton className="group p-1">
                  <HiChevronDown className="size-4 group-data-open:rotate-180 transition duration-500" />
                </ComboboxButton>
              </div>

              {/* Dropdown Options */}
              <ComboboxOptions
                anchor="top"
                style={{ pointerEvents: "all" }}
                className={cn(
                  "empty:invisible w-72",
                  "bg-white dark:bg-neutral-900",
                  "flex flex-col gap-2 max-h-56 z-100",
                  "rounded-xl p-2",
                )}
              >
                <div className="flex flex-col">
                  <h3 className="font-bold text-xs text-center flex items-center justify-center gap-2">
                    <MdLightbulb className="size-4" /> Suggestions (
                    {filteredTags.length})
                  </h3>
                  <p className="text-neutral-500 dark:text-neutral-400 text-center text-xs">
                    Select a tag or create a new one
                  </p>
                </div>

                <div className="flex flex-col gap-1">
                  {query.length > 0 && (
                    <TagOption value={{ id: null, name: query }}>
                      Create <span className="font-bold">"{query}"</span>
                    </TagOption>
                  )}
                  {filteredTags.map((tag) => (
                    <TagOption key={tag.id} value={tag}>
                      {tag.name}
                    </TagOption>
                  ))}
                </div>
              </ComboboxOptions>
            </Combobox>
          </div>
        </div>

        {/* Save Button */}
        <PrimaryButton
          type="submit"
          className={cn("mt-2 disabled:opacity-50")}
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Saving..." : "Save"}
        </PrimaryButton>
      </form>
    </FormProvider>
  );
});

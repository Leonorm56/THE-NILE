import * as changeCase from "change-case";
import * as yup from "yup";

import { Controller, useForm } from "react-hook-form";
import { HiOutlineTrash, HiTag } from "react-icons/hi2";

import Alert from "./Alert";
import AppDialogContent from "./AppDialogContent";
import { Dialog } from "radix-ui";
import Input from "./Input";
import { LuTags } from "react-icons/lu";
import { MdAdd } from "react-icons/md";
import { Reorder } from "motion/react";
import ReorderItem from "./ReorderItem";
import { cn } from "../lib/utils";
import toast from "react-hot-toast";
import useAppStore from "../store/useAppStore";
import { useState } from "react";
import { yupResolver } from "@hookform/resolvers/yup";

const schema = yup
  .object({
    name: yup.string().trim().required().label("Tag Name"),
  })
  .required();

function TagItem({ tag }) {
  const [isEditing, setIsEditing] = useState(false);
  const tags = useAppStore((state) => state.tags);
  const updateTag = useAppStore((state) => state.updateTag);
  const removeTag = useAppStore((state) => state.removeTag);

  const handleUpdateTag = (e) => {
    e.stopPropagation();
    e.preventDefault();

    const newName = e.target.value.trim();
    if (newName === "") {
      toast.error("Tag name cannot be empty");
      return;
    }

    const newId = changeCase.kebabCase(newName);
    const exists = tags.some((item) => item.id === newId && item.id !== tag.id);

    if (exists) {
      toast.error("Tag with this name already exists");
      return;
    }

    updateTag(tag.id, newName);
  };

  return (
    <ReorderItem key={tag.id} value={tag} disabled={isEditing}>
      <div className="flex gap-2">
        {isEditing ? (
          <Input
            autoFocus
            defaultValue={tag.name}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleUpdateTag(e);
                setIsEditing(false);
              } else if (e.key === "Escape") {
                setIsEditing(false);
              }
            }}
            onBlur={(e) => {
              handleUpdateTag(e);
              setIsEditing(false);
            }}
          />
        ) : (
          // Display Tag Name
          <div
            onClick={() => setIsEditing((prev) => !prev)}
            className={cn(
              "flex items-center gap-2 cursor-pointer",
              "p-2 rounded-xl grow min-w-0",
              "bg-neutral-100 dark:bg-neutral-700",
            )}
          >
            <HiTag className="size-4 text-orange-500" />
            <span className="grow min-w-0 truncate">{tag.name}</span>
          </div>
        )}

        {/* Delete Button */}
        <button
          className={cn(
            "bg-neutral-100 dark:bg-neutral-700",
            "hover:bg-red-100 hover:text-red-700",
            "dark:hover:bg-red-200 dark:hover:text-red-500",
            "flex items-center justify-center",
            "px-3 rounded-xl shrink-0",
          )}
          onClick={() => removeTag(tag.id)}
        >
          <HiOutlineTrash className="size-4" />
        </button>
      </div>
    </ReorderItem>
  );
}

export default function TagsDialog() {
  const tags = useAppStore((state) => state.tags);
  const addTag = useAppStore((state) => state.addTag);
  const removeTag = useAppStore((state) => state.removeTag);
  const setTags = useAppStore((state) => state.setTags);

  const form = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      name: "",
    },
  });

  const handleAddTag = (data) => {
    const name = data.name.trim();
    if (name === "") {
      toast.error("Tag name cannot be empty");
      return;
    }

    /* Generate new tag object */
    const newTag = {
      id: changeCase.kebabCase(name),
      name,
    };

    /** Check for duplicates */
    const exists = tags.some((item) => item.id === newTag.id);

    /** Debugging logs */
    console.log(
      "Adding tag:",
      newTag,
      "Exists:",
      exists,
      "Existing tags:",
      tags,
    );

    /** Handle duplicates */
    if (exists) {
      toast.error("Tag with this name already exists");
      return;
    }

    /* Add tag to store */
    addTag(newTag);

    /* Reset form */
    form.reset();
  };

  return (
    <AppDialogContent
      title={"Tags"}
      description={"Configure Tags"}
      icon={LuTags}
    >
      {/* Add Tag Form */}
      <form onSubmit={form.handleSubmit(handleAddTag)} className="flex gap-2">
        {/* Tag Name Input */}
        <Controller
          control={form.control}
          name="name"
          render={({ field }) => (
            <Input {...field} placeholder="Enter tag name" />
          )}
        />

        {/* Submit Button */}
        <button
          type="submit"
          className={cn(
            "px-4 py-2 bg-orange-500 text-white rounded-xl",
            "font-bold shrink-0 flex items-center gap-1",
          )}
        >
          <MdAdd className="size-4" />
          Add Tag
        </button>
      </form>

      {/* Total Tags */}
      <h3 className="font-bold text-center">Total Tags: {tags.length}</h3>

      {/* Alert */}
      {tags.length === 0 ? (
        <Alert variant={"warning"}>
          No tags added yet. You can add tags using the input field above.
        </Alert>
      ) : (
        <>
          {/* Info Alert */}
          <Alert variant={"info"}>
            You can reorder tags by dragging and dropping them. Click on a tag
            to edit its name.
          </Alert>
          {/* Tags List */}
          <Reorder.Group
            values={tags}
            onReorder={(newOrder) => setTags(newOrder)}
            className="flex flex-col gap-2"
          >
            {tags.map((item) => (
              <TagItem key={item.id} tag={item} />
            ))}
          </Reorder.Group>
        </>
      )}

      {/* Close Dialog */}
      <Dialog.Close
        className={cn(
          "px-4 py-2.5 bg-orange-500 text-white rounded-xl",
          "mt-2 font-bold",
        )}
      >
        Close
      </Dialog.Close>
    </AppDialogContent>
  );
}

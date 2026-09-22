import { api } from "../../../../convex/_generated/api";
import { type FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { designTokens } from "../../../designTokens";
import { getConvexErrorMessage } from "../../auth";

export type Category = {
  _id: Id<"categories">;
  name: string;
  description?: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
};

export const DEFAULT_NEW_COLOR: string = designTokens.color.category.default;

function getErrorMessage(error: unknown, fallback: string) {
  return getConvexErrorMessage(error, fallback);
}

export function useCategorySettings() {
  const categories = useQuery(api.categories.queries.listForSettings) as Category[] | undefined;
  const createCategory = useMutation(api.categories.mutations.createCategory);
  const updateCategory = useMutation(api.categories.mutations.updateCategory);
  const deactivateCategory = useMutation(api.categories.mutations.deactivateCategory);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newColor, setNewColor] = useState<string>(DEFAULT_NEW_COLOR);
  const [editingId, setEditingId] = useState<Id<"categories"> | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editColor, setEditColor] = useState<string>(DEFAULT_NEW_COLOR);
  const [savingTarget, setSavingTarget] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [snackbar, setSnackbar] = useState("");

  const beginEdit = (category: Category) => {
    setEditingId(category._id);
    setEditName(category.name);
    setEditDescription(category.description ?? "");
    setEditColor(category.color);
    setError("");
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setSavingTarget("create");
    setError("");
    try {
      await createCategory({ name: newName, color: newColor, description: newDescription });
      setNewName("");
      setNewDescription("");
      setNewColor(DEFAULT_NEW_COLOR);
      setIsCreateOpen(false);
      setSnackbar("カテゴリを追加しました");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "カテゴリを追加できませんでした。"));
    } finally {
      setSavingTarget(null);
    }
  };

  const handleUpdate = async () => {
    if (editingId === null) return;
    setSavingTarget(`edit-${editingId}`);
    setError("");
    try {
      await updateCategory({
        categoryId: editingId,
        name: editName,
        color: editColor,
        description: editDescription,
      });
      setEditingId(null);
      setSnackbar("カテゴリを更新しました");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "カテゴリを更新できませんでした。"));
    } finally {
      setSavingTarget(null);
    }
  };

  const handleDeactivate = async (categoryId: Id<"categories">) => {
    setSavingTarget(`deactivate-${categoryId}`);
    setError("");
    try {
      await deactivateCategory({ categoryId });
      setSnackbar("カテゴリを無効化しました");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "カテゴリを無効化できませんでした。"));
    } finally {
      setSavingTarget(null);
    }
  };

  return {
    beginEdit,
    categories,
    editDescription,
    editColor,
    editName,
    editingId,
    error,
    handleCreate,
    handleDeactivate,
    handleUpdate,
    isCreateOpen,
    newColor,
    newDescription,
    newName,
    savingTarget,
    setEditColor,
    setEditDescription,
    setEditName,
    setEditingId,
    setIsCreateOpen,
    setNewColor,
    setNewDescription,
    setNewName,
    setSnackbar,
    snackbar,
  };
}

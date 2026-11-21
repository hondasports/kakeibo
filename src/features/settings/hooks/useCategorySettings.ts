import { api } from "../../../../convex/_generated/api";
import { type FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { designTokens } from "../../../designTokens";
import {
  MAX_CATEGORY_DESCRIPTION_LENGTH,
  MAX_CATEGORY_NAME_LENGTH,
  validateCategoryColor,
  validateCategoryDescription,
  validateCategoryName,
} from "../../../../lib/domain/categories/category";
import { getConvexErrorMessage } from "../../auth";

export type Category = {
  _id: Id<"categories">;
  groupId: Id<"groups">;
  name: string;
  description?: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
};

export const DEFAULT_NEW_COLOR: string = designTokens.color.category.default;

export type CategoryFieldErrors = {
  name?: string;
  color?: string;
  description?: string;
};

type CategoryFieldValues = {
  name: string;
  color: string;
  description?: string;
};

function validateCategoryFields(values: CategoryFieldValues): CategoryFieldErrors {
  const errors: CategoryFieldErrors = {};
  const nameResult = validateCategoryName(values.name);
  if (!nameResult.success) {
    errors.name =
      nameResult.error === "empty"
        ? "カテゴリ名を入力してください"
        : `カテゴリ名は${MAX_CATEGORY_NAME_LENGTH}文字以内で入力してください`;
  }
  const colorResult = validateCategoryColor(values.color);
  if (!colorResult.success) {
    errors.color = "カテゴリ色を正しい形式で指定してください";
  }
  const descriptionResult = validateCategoryDescription(values.description);
  if (!descriptionResult.success) {
    errors.description = `AI分類ヒントは${MAX_CATEGORY_DESCRIPTION_LENGTH}文字以内で入力してください`;
  }
  return errors;
}

const SERVER_FIELD_ERROR_PATTERNS: { field: keyof CategoryFieldErrors; pattern: RegExp }[] = [
  { field: "name", pattern: /category name/i },
  { field: "color", pattern: /category color/i },
  { field: "description", pattern: /category description/i },
];

function serverErrorField(message: string): keyof CategoryFieldErrors | null {
  const matched = SERVER_FIELD_ERROR_PATTERNS.find(({ pattern }) => pattern.test(message));
  return matched?.field ?? null;
}

type FailedAction =
  | { kind: "create"; groupId: Id<"groups"> | null }
  | { kind: "update"; groupId: Id<"groups"> | null }
  | { kind: "deactivate"; categoryId: Id<"categories">; groupId: Id<"groups"> | null }
  | { kind: "reactivate"; categoryId: Id<"categories">; groupId: Id<"groups"> | null }
  | {
      kind: "move";
      categoryId: Id<"categories">;
      direction: "up" | "down";
      groupId: Id<"groups"> | null;
    };

function getErrorMessage(error: unknown, fallback: string) {
  return getConvexErrorMessage(error, fallback);
}

export function useCategorySettings() {
  const categories = useQuery(api.categories.queries.listForSettings, {
    allowUnavailable: true,
  }) as Category[] | undefined;
  const createCategory = useMutation(api.categories.mutations.createCategory);
  const updateCategory = useMutation(api.categories.mutations.updateCategory);
  const deactivateCategory = useMutation(api.categories.mutations.deactivateCategory);
  const reactivateCategory = useMutation(api.categories.mutations.reactivateCategory);
  const moveCategory = useMutation(api.categories.mutations.moveCategory);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newColor, setNewColor] = useState<string>(DEFAULT_NEW_COLOR);
  const [editingId, setEditingId] = useState<Id<"categories"> | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editColor, setEditColor] = useState<string>(DEFAULT_NEW_COLOR);
  const [editBaseline, setEditBaseline] = useState<CategoryFieldValues | null>(null);
  const [createFieldErrors, setCreateFieldErrors] = useState<CategoryFieldErrors>({});
  const [editFieldErrors, setEditFieldErrors] = useState<CategoryFieldErrors>({});
  const [savingTarget, setSavingTarget] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [snackbar, setSnackbar] = useState("");
  const [lastFailedAction, setLastFailedAction] = useState<FailedAction | null>(null);

  // 再試行は失敗した時点のグループでのみ有効にする（グループ切替後の誤登録防止）
  const currentGroupId = categories?.[0]?.groupId ?? null;
  const canRetry = lastFailedAction !== null && lastFailedAction.groupId === currentGroupId;

  const beginEdit = (category: Category) => {
    setEditingId(category._id);
    setEditName(category.name);
    setEditDescription(category.description ?? "");
    setEditColor(category.color);
    setEditBaseline({
      name: category.name,
      color: category.color,
      description: category.description ?? "",
    });
    setEditFieldErrors({});
    setError("");
  };

  // 編集開始時の値と現在値が違うときだけ「未保存の変更がある」とみなす
  const editIsDirty =
    editingId !== null &&
    editBaseline !== null &&
    (editName !== editBaseline.name ||
      editColor !== editBaseline.color ||
      editDescription !== (editBaseline.description ?? ""));

  const clearCreateFieldError = (field: keyof CategoryFieldErrors) => {
    setCreateFieldErrors((current) =>
      current[field] ? { ...current, [field]: undefined } : current,
    );
  };

  const clearEditFieldError = (field: keyof CategoryFieldErrors) => {
    setEditFieldErrors((current) =>
      current[field] ? { ...current, [field]: undefined } : current,
    );
  };

  const applyServerError = (
    caughtError: unknown,
    fallback: string,
    setFieldErrors: (errors: CategoryFieldErrors) => void,
  ) => {
    const message = getErrorMessage(caughtError, fallback);
    const field = serverErrorField(message);
    if (field !== null) {
      setFieldErrors({ [field]: message });
      return;
    }
    setError(message);
  };

  const submitCreate = async () => {
    const fieldErrors = validateCategoryFields({
      name: newName,
      color: newColor,
      description: newDescription,
    });
    setCreateFieldErrors(fieldErrors);
    if (Object.values(fieldErrors).some(Boolean)) {
      return;
    }
    setSavingTarget("create");
    setError("");
    try {
      await createCategory({ name: newName, color: newColor, description: newDescription });
      setNewName("");
      setNewDescription("");
      setNewColor(DEFAULT_NEW_COLOR);
      setIsCreateOpen(false);
      setSnackbar("カテゴリを追加しました");
      setLastFailedAction(null);
    } catch (caughtError) {
      setLastFailedAction({ kind: "create", groupId: currentGroupId });
      applyServerError(caughtError, "カテゴリを追加できませんでした。", setCreateFieldErrors);
    } finally {
      setSavingTarget(null);
    }
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    await submitCreate();
  };

  const submitUpdate = async () => {
    if (editingId === null) return;
    const fieldErrors = validateCategoryFields({
      name: editName,
      color: editColor,
      description: editDescription,
    });
    setEditFieldErrors(fieldErrors);
    if (Object.values(fieldErrors).some(Boolean)) {
      return;
    }
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
      setLastFailedAction(null);
    } catch (caughtError) {
      setLastFailedAction({ kind: "update", groupId: currentGroupId });
      applyServerError(caughtError, "カテゴリを更新できませんでした。", setEditFieldErrors);
    } finally {
      setSavingTarget(null);
    }
  };

  const handleUpdate = async () => {
    await submitUpdate();
  };

  const submitMove = async (categoryId: Id<"categories">, direction: "up" | "down") => {
    setSavingTarget(`move-${categoryId}`);
    setError("");
    try {
      await moveCategory({ categoryId, direction });
      setSnackbar("並び順を更新しました");
      setLastFailedAction(null);
    } catch (caughtError) {
      setLastFailedAction({ kind: "move", categoryId, direction, groupId: currentGroupId });
      setError(getErrorMessage(caughtError, "並び順を変更できませんでした。"));
    } finally {
      setSavingTarget(null);
    }
  };

  const handleMoveCategory = async (categoryId: Id<"categories">, direction: "up" | "down") => {
    await submitMove(categoryId, direction);
  };

  const submitDeactivate = async (categoryId: Id<"categories">) => {
    setSavingTarget(`deactivate-${categoryId}`);
    setError("");
    try {
      await deactivateCategory({ categoryId });
      setSnackbar("カテゴリを無効化しました");
      setLastFailedAction(null);
    } catch (caughtError) {
      setLastFailedAction({ kind: "deactivate", categoryId, groupId: currentGroupId });
      setError(getErrorMessage(caughtError, "カテゴリを無効化できませんでした。"));
    } finally {
      setSavingTarget(null);
    }
  };

  const handleDeactivate = async (categoryId: Id<"categories">) => {
    await submitDeactivate(categoryId);
  };

  const submitReactivate = async (categoryId: Id<"categories">) => {
    setSavingTarget(`reactivate-${categoryId}`);
    setError("");
    try {
      await reactivateCategory({ categoryId });
      setSnackbar("カテゴリを有効化しました");
      setLastFailedAction(null);
    } catch (caughtError) {
      setLastFailedAction({ kind: "reactivate", categoryId, groupId: currentGroupId });
      setError(getErrorMessage(caughtError, "カテゴリを有効化できませんでした。"));
    } finally {
      setSavingTarget(null);
    }
  };

  const handleReactivate = async (categoryId: Id<"categories">) => {
    await submitReactivate(categoryId);
  };

  const retryLastFailed = async () => {
    if (lastFailedAction === null) return;
    switch (lastFailedAction.kind) {
      case "create":
        await submitCreate();
        break;
      case "update":
        await submitUpdate();
        break;
      case "deactivate":
        await submitDeactivate(lastFailedAction.categoryId);
        break;
      case "reactivate":
        await submitReactivate(lastFailedAction.categoryId);
        break;
      case "move":
        await submitMove(lastFailedAction.categoryId, lastFailedAction.direction);
        break;
    }
  };

  return {
    beginEdit,
    canRetry,
    categories,
    createFieldErrors,
    editBaseline,
    editDescription,
    editColor,
    editFieldErrors,
    editIsDirty,
    editName,
    editingId,
    error,
    handleCreate,
    handleDeactivate,
    handleMoveCategory,
    handleReactivate,
    handleUpdate,
    isCreateOpen,
    newColor,
    newDescription,
    newName,
    retryLastFailed,
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
    clearCreateFieldError,
    clearEditFieldError,
  };
}

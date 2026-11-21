import { Box } from "@mui/material";
import type { Category, CategoryFieldErrors } from "../hooks/useCategorySettings";
import { CategorySettingsRow } from "./CategorySettingsRow";

type CategorySettingsListProps = {
  categories: Category[];
  clearEditFieldError: (field: keyof CategoryFieldErrors) => void;
  editColor: string;
  editDescription: string;
  editFieldErrors: CategoryFieldErrors;
  editIsDirty: boolean;
  editName: string;
  editingId: Category["_id"] | null;
  onBeginEdit: (category: Category) => void;
  onCancelEdit: () => void;
  onEditColorChange: (color: string) => void;
  onEditDescriptionChange: (description: string) => void;
  onEditNameChange: (name: string) => void;
  onMove: (category: Category, direction: "up" | "down") => void;
  onReactivate: (categoryId: Category["_id"]) => void;
  onRequestDeactivate: (category: Category) => void;
  onUpdate: () => void;
  savingTarget: string | null;
};

export function CategorySettingsList({
  categories,
  clearEditFieldError,
  editColor,
  editDescription,
  editFieldErrors,
  editIsDirty,
  editName,
  editingId,
  onBeginEdit,
  onCancelEdit,
  onEditColorChange,
  onEditDescriptionChange,
  onEditNameChange,
  onMove,
  onReactivate,
  onRequestDeactivate,
  onUpdate,
  savingTarget,
}: CategorySettingsListProps) {
  return (
    <Box component="ul" className="category-settings-list">
      {categories.map((category, index) => (
        <CategorySettingsRow
          canMoveDown={index < categories.length - 1}
          canMoveUp={index > 0}
          category={category}
          clearEditFieldError={clearEditFieldError}
          editColor={editColor}
          editDescription={editDescription}
          editFieldErrors={editFieldErrors}
          editIsDirty={editIsDirty && editingId === category._id}
          editName={editName}
          isEditing={editingId === category._id}
          key={category._id}
          onBeginEdit={onBeginEdit}
          onCancelEdit={onCancelEdit}
          onEditColorChange={onEditColorChange}
          onEditDescriptionChange={onEditDescriptionChange}
          onEditNameChange={onEditNameChange}
          onMove={onMove}
          onReactivate={onReactivate}
          onRequestDeactivate={onRequestDeactivate}
          onUpdate={onUpdate}
          savingTarget={savingTarget}
        />
      ))}
    </Box>
  );
}

import {
  Box,
  Button,
  Chip,
  Collapse,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import { designTokens } from "../../../designTokens";
import type { Category, CategoryFieldErrors } from "../hooks/useCategorySettings";
import { MAX_CATEGORY_DESCRIPTION_LENGTH } from "../../../../lib/domain/categories/category";
import { CategoryColorSwatches } from "./CategoryColorSwatches";

type CategorySettingsRowProps = {
  canMoveDown: boolean;
  canMoveUp: boolean;
  category: Category;
  clearEditFieldError: (field: keyof CategoryFieldErrors) => void;
  editColor: string;
  editDescription: string;
  editFieldErrors: CategoryFieldErrors;
  editIsDirty: boolean;
  editName: string;
  isEditing: boolean;
  onMove: (category: Category, direction: "up" | "down") => void;
  onBeginEdit: (category: Category) => void;
  onCancelEdit: () => void;
  onEditColorChange: (color: string) => void;
  onEditDescriptionChange: (description: string) => void;
  onEditNameChange: (name: string) => void;
  onReactivate: (categoryId: Category["_id"]) => void;
  onRequestDeactivate: (category: Category) => void;
  onUpdate: () => void;
  savingTarget: string | null;
};

export function CategorySettingsRow({
  canMoveDown,
  canMoveUp,
  category,
  clearEditFieldError,
  editColor,
  editDescription,
  editFieldErrors,
  editIsDirty,
  editName,
  isEditing,
  onBeginEdit,
  onMove,
  onCancelEdit,
  onEditColorChange,
  onEditDescriptionChange,
  onEditNameChange,
  onReactivate,
  onRequestDeactivate,
  onUpdate,
  savingTarget,
}: CategorySettingsRowProps) {
  const editSaving = savingTarget === `edit-${category._id}`;
  const reactivateSaving = savingTarget === `reactivate-${category._id}`;
  const moveSaving = savingTarget === `move-${category._id}`;
  const moveDisabled = editSaving || moveSaving;

  return (
    <Box aria-label={`カテゴリ ${category.name}`} className="category-settings-row" component="li">
      <Box className="category-settings-summary">
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
          <Box
            aria-hidden="true"
            sx={{
              bgcolor: category.color,
              border: `1px solid ${designTokens.color.border.subtle}`,
              borderRadius: "50%",
              flexShrink: 0,
              height: 16,
              width: 16,
            }}
          />
          <Typography sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>
            {category.name}
          </Typography>
        </Stack>
        <Chip
          color={category.isActive ? "success" : "default"}
          label={category.isActive ? "使用中" : "無効"}
          size="small"
          variant="outlined"
        />
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flexShrink: 0 }}>
          <Tooltip title="上に移動">
            <span>
              <IconButton
                aria-label={`${category.name}を上に移動`}
                disabled={!canMoveUp || moveDisabled}
                onClick={() => onMove(category, "up")}
                size="small"
              >
                <KeyboardArrowUpIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="下に移動">
            <span>
              <IconButton
                aria-label={`${category.name}を下に移動`}
                disabled={!canMoveDown || moveDisabled}
                onClick={() => onMove(category, "down")}
                size="small"
              >
                <KeyboardArrowDownIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
        <Button
          aria-controls={`category-editor-${category._id}`}
          aria-expanded={isEditing}
          aria-label={`${category.name}を編集`}
          disabled={isEditing}
          endIcon={<ChevronRightIcon />}
          onClick={() => onBeginEdit(category)}
          size="small"
        >
          編集
        </Button>
      </Box>

      <Collapse id={`category-editor-${category._id}`} in={isEditing} unmountOnExit>
        <Stack className="category-settings-editor" spacing={1.5}>
          <Box className="category-settings-editor-fields">
            {editIsDirty ? (
              <Typography
                className="category-settings-dirty-notice"
                color="warning.dark"
                variant="caption"
              >
                未保存の変更があります。保存またはキャンセルしてください。
              </Typography>
            ) : null}
            <TextField
              autoFocus
              className="category-settings-field-name"
              disabled={editSaving}
              error={Boolean(editFieldErrors.name)}
              fullWidth
              helperText={editFieldErrors.name}
              label="カテゴリ名を編集"
              name="editCategoryName"
              onChange={(event) => {
                onEditNameChange(event.target.value);
                clearEditFieldError("name");
              }}
              value={editName}
            />
            <TextField
              className="category-settings-field-color"
              disabled={editSaving}
              error={Boolean(editFieldErrors.color)}
              helperText={editFieldErrors.color}
              label="カテゴリ色"
              name="editCategoryColor"
              onChange={(event) => {
                onEditColorChange(event.target.value);
                clearEditFieldError("color");
              }}
              slotProps={{ inputLabel: { shrink: true } }}
              type="color"
              value={editColor}
              sx={{ width: "100%" }}
            />
            <CategoryColorSwatches
              disabled={editSaving}
              onChange={(color) => {
                onEditColorChange(color);
                clearEditFieldError("color");
              }}
              value={editColor}
            />
            <TextField
              className="category-settings-field-description"
              disabled={editSaving}
              error={Boolean(editFieldErrors.description)}
              fullWidth
              helperText={
                editFieldErrors.description ??
                `${editDescription.length}/${MAX_CATEGORY_DESCRIPTION_LENGTH}`
              }
              label="カテゴリのAI分類ヒント"
              name="editCategoryDescription"
              multiline
              minRows={4}
              onChange={(event) => {
                onEditDescriptionChange(event.target.value);
                clearEditFieldError("description");
              }}
              slotProps={{ htmlInput: { maxLength: MAX_CATEGORY_DESCRIPTION_LENGTH } }}
              value={editDescription}
            />
            <Stack className="category-settings-editor-actions" direction="row" spacing={1}>
              <Button
                disabled={editSaving}
                onClick={onUpdate}
                size="small"
                sx={{ fontSize: "0.8125rem", lineHeight: 1.4, whiteSpace: "nowrap" }}
                variant="contained"
              >
                {editSaving ? "保存中…" : "変更を保存"}
              </Button>
              <Button
                disabled={editSaving}
                onClick={onCancelEdit}
                size="small"
                sx={{ fontSize: "0.8125rem", lineHeight: 1.4, whiteSpace: "nowrap" }}
              >
                キャンセル
              </Button>
            </Stack>
          </Box>
          <Box className="category-settings-deactivate">
            {category.isActive ? (
              <Button
                aria-label={`${category.name}を無効化`}
                color="error"
                onClick={() => onRequestDeactivate(category)}
                size="small"
                variant="outlined"
              >
                無効化
              </Button>
            ) : (
              <Button
                aria-label={`${category.name}を有効化`}
                disabled={reactivateSaving}
                onClick={() => onReactivate(category._id)}
                size="small"
                variant="outlined"
              >
                {reactivateSaving ? "有効化中…" : "有効化"}
              </Button>
            )}
          </Box>
        </Stack>
      </Collapse>
    </Box>
  );
}

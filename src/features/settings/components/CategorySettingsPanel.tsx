import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  Skeleton,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { ConfirmDangerousActionDialog } from "../../group-admin/components/ConfirmDangerousActionDialog";
import { type Category, useCategorySettings } from "../hooks/useCategorySettings";
import { CategorySettingsList } from "./CategorySettingsList";
import { CategoryColorSwatches } from "./CategoryColorSwatches";
import { MAX_CATEGORY_DESCRIPTION_LENGTH } from "../../../../lib/domain/categories/category";

export function CategorySettingsPanel() {
  const {
    beginEdit,
    canRetry,
    categories,
    clearCreateFieldError,
    clearEditFieldError,
    createFieldErrors,
    editDescription,
    editColor,
    editFieldErrors,
    editName,
    editingId,
    error,
    handleCreate,
    handleDeactivate,
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
  } = useCategorySettings();

  const [pendingDeactivate, setPendingDeactivate] = useState<Category | null>(null);
  const deactivateConfirming =
    pendingDeactivate !== null && savingTarget === `deactivate-${pendingDeactivate._id}`;

  const handleConfirmDeactivate = async () => {
    if (pendingDeactivate === null) return;
    const categoryId = pendingDeactivate._id;
    await handleDeactivate(categoryId);
    setPendingDeactivate(null);
  };

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography component="h2" variant="h5">
          カテゴリ
        </Typography>
        <Typography color="text.secondary" variant="body2">
          支出入力に使うカテゴリと利用状態を確認します。分類ヒントは、レシート明細をカテゴリー分類するときのAI判断に使用します。
        </Typography>
      </Box>

      {error ? (
        <Alert
          action={
            canRetry ? (
              <Button color="inherit" onClick={() => void retryLastFailed()} size="small">
                再試行
              </Button>
            ) : undefined
          }
          severity="error"
          variant="outlined"
        >
          {error}
        </Alert>
      ) : null}

      {categories === undefined ? (
        <Stack aria-label="カテゴリを読み込んでいます" spacing={1}>
          <Skeleton height={48} variant="rounded" />
          <Skeleton height={48} variant="rounded" />
        </Stack>
      ) : categories.length === 0 ? (
        <Alert
          action={
            <Button color="inherit" onClick={() => setIsCreateOpen(true)} size="small">
              最初のカテゴリを追加
            </Button>
          }
          severity="info"
          variant="outlined"
        >
          カテゴリがまだありません。
        </Alert>
      ) : (
        <CategorySettingsList
          categories={categories}
          clearEditFieldError={clearEditFieldError}
          editColor={editColor}
          editDescription={editDescription}
          editFieldErrors={editFieldErrors}
          editName={editName}
          editingId={editingId}
          onBeginEdit={beginEdit}
          onCancelEdit={() => setEditingId(null)}
          onEditColorChange={setEditColor}
          onEditDescriptionChange={setEditDescription}
          onEditNameChange={setEditName}
          onReactivate={(categoryId) => void handleReactivate(categoryId)}
          onRequestDeactivate={setPendingDeactivate}
          onUpdate={() => void handleUpdate()}
          savingTarget={savingTarget}
        />
      )}

      <Box>
        <Button
          aria-controls="category-create-form"
          aria-expanded={isCreateOpen}
          onClick={() => setIsCreateOpen((open) => !open)}
          startIcon={<AddIcon />}
          variant="text"
        >
          カテゴリを追加
        </Button>
        <Collapse id="category-create-form" in={isCreateOpen} unmountOnExit>
          <Box component="form" onSubmit={handleCreate} sx={{ mt: 1.5 }}>
            <Box className="category-settings-create-fields">
              <TextField
                className="category-settings-field-name"
                disabled={savingTarget === "create"}
                error={Boolean(createFieldErrors.name)}
                fullWidth
                helperText={createFieldErrors.name}
                label="新しいカテゴリ名"
                name="newCategoryName"
                onChange={(event) => {
                  setNewName(event.target.value);
                  clearCreateFieldError("name");
                }}
                value={newName}
              />
              <TextField
                className="category-settings-field-description"
                disabled={savingTarget === "create"}
                error={Boolean(createFieldErrors.description)}
                fullWidth
                helperText={
                  createFieldErrors.description ??
                  `${newDescription.length}/${MAX_CATEGORY_DESCRIPTION_LENGTH}`
                }
                label="新しいカテゴリのAI分類ヒント"
                name="newCategoryDescription"
                multiline
                minRows={4}
                onChange={(event) => {
                  setNewDescription(event.target.value);
                  clearCreateFieldError("description");
                }}
                slotProps={{ htmlInput: { maxLength: MAX_CATEGORY_DESCRIPTION_LENGTH } }}
                value={newDescription}
              />
              <Box>
                <TextField
                  className="category-settings-field-color"
                  disabled={savingTarget === "create"}
                  error={Boolean(createFieldErrors.color)}
                  helperText={createFieldErrors.color}
                  label="新しいカテゴリ色"
                  name="newCategoryColor"
                  onChange={(event) => {
                    setNewColor(event.target.value);
                    clearCreateFieldError("color");
                  }}
                  slotProps={{ inputLabel: { shrink: true } }}
                  type="color"
                  value={newColor}
                  sx={{ width: "100%" }}
                />
                <CategoryColorSwatches
                  disabled={savingTarget === "create"}
                  onChange={(color) => {
                    setNewColor(color);
                    clearCreateFieldError("color");
                  }}
                  value={newColor}
                />
              </Box>
              <Button
                className="category-settings-create-action"
                disabled={savingTarget === "create"}
                startIcon={savingTarget === "create" ? <CircularProgress size={16} /> : undefined}
                type="submit"
                variant="contained"
              >
                追加する
              </Button>
            </Box>
          </Box>
        </Collapse>
      </Box>

      <ConfirmDangerousActionDialog
        confirmLabel="無効化する"
        confirming={deactivateConfirming}
        description={`「${pendingDeactivate?.name ?? ""}」を無効化します。過去の家計記録や集計には影響しませんが、入力画面やAI分類の候補からは表示されなくなります。あとから再有効化できます。`}
        onCancel={() => setPendingDeactivate(null)}
        onConfirm={handleConfirmDeactivate}
        open={pendingDeactivate !== null}
        title="カテゴリを無効化しますか？"
      />

      <Snackbar
        anchorOrigin={{ horizontal: "center", vertical: "bottom" }}
        autoHideDuration={3000}
        onClose={() => setSnackbar("")}
        open={snackbar !== ""}
      >
        <Alert
          aria-live="polite"
          onClose={() => setSnackbar("")}
          severity="success"
          variant="filled"
        >
          {snackbar}
        </Alert>
      </Snackbar>
    </Stack>
  );
}

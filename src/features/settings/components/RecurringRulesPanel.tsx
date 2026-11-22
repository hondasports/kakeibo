import { useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type { EntryKind } from "../../../../lib/domain/common/entryKind";
import { validateRecurringRuleInput } from "../../../../lib/domain/recurringRules/recurringRule";
import { recurringRuleScheduleLabel } from "../../expense-entry/components/RecurringDueSection";

type RuleForm = {
  kind: EntryKind;
  title: string;
  amountYen: string;
  categoryId: string;
  shopName: string;
  memo: string;
  frequency: "weekly" | "monthly";
  dayOfWeek: number;
  dayOfMonth: number;
};

const emptyForm: RuleForm = {
  kind: "expense",
  title: "",
  amountYen: "",
  categoryId: "",
  shopName: "",
  memo: "",
  frequency: "monthly",
  dayOfWeek: 1,
  dayOfMonth: 1,
};

function toForm(rule: Doc<"recurringEntryRules">): RuleForm {
  return {
    kind: rule.kind,
    title: rule.title,
    amountYen: String(rule.amountYen),
    categoryId: rule.categoryId ?? "",
    shopName: rule.shopName ?? "",
    memo: rule.memo ?? "",
    frequency: rule.frequency,
    dayOfWeek: rule.dayOfWeek ?? 1,
    dayOfMonth: rule.dayOfMonth ?? 1,
  };
}

export function RecurringRulesPanel() {
  const rules = useQuery(api.recurringRules.index.listRecurringRules);
  const categories = useQuery(api.categories.queries.listActive);
  const createRule = useMutation(api.recurringRules.index.createRecurringRule);
  const updateRule = useMutation(api.recurringRules.index.updateRecurringRule);
  const setActive = useMutation(api.recurringRules.index.setRecurringRuleActive);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"recurringEntryRules"> | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setDialogOpen(true);
  };
  const openEdit = (rule: Doc<"recurringEntryRules">) => {
    setEditingId(rule._id);
    setForm(toForm(rule));
    setError(null);
    setDialogOpen(true);
  };

  const amountYen = Number(form.amountYen);
  const formValid = validateRecurringRuleInput({
    kind: form.kind,
    title: form.title,
    amountYen,
    categoryId: form.kind === "expense" ? form.categoryId || undefined : undefined,
    frequency: form.frequency,
    dayOfWeek: form.frequency === "weekly" ? form.dayOfWeek : undefined,
    dayOfMonth: form.frequency === "monthly" ? form.dayOfMonth : undefined,
  }).success;

  const handleSave = async () => {
    if (!formValid) return;
    setSaving(true);
    setError(null);
    const args = {
      kind: form.kind,
      title: form.title,
      amountYen,
      categoryId:
        form.kind === "expense" && form.categoryId
          ? (form.categoryId as Id<"categories">)
          : undefined,
      shopName: form.shopName.trim() ? form.shopName.trim() : undefined,
      memo: form.memo.trim() ? form.memo.trim() : undefined,
      frequency: form.frequency,
      dayOfWeek: form.frequency === "weekly" ? form.dayOfWeek : undefined,
      dayOfMonth: form.frequency === "monthly" ? form.dayOfMonth : undefined,
    };
    try {
      if (editingId === null) {
        await createRule(args);
      } else {
        await updateRule({ ruleId: editingId, ...args });
      }
      setDialogOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={1.5}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", justifyContent: "space-between" }}
      >
        <Typography component="h2" variant="h5">
          定期定義
        </Typography>
        <Button onClick={openCreate} size="small" variant="outlined">
          追加
        </Button>
      </Stack>
      <Typography color="text.secondary" variant="body2">
        家賃や光熱費など、毎週・毎月くり返し発生する支出・収入を登録しておくと、期日が来たとき入力画面からワンタップで記録できます。
      </Typography>
      {rules === undefined ? (
        <Typography color="text.secondary" variant="body2">
          読み込んでいます…
        </Typography>
      ) : rules.length === 0 ? (
        <Typography color="text.secondary" variant="body2">
          定期定義はまだありません。
        </Typography>
      ) : (
        <List disablePadding>
          {rules.map((rule) => (
            <ListItem
              disableGutters
              key={rule._id}
              secondaryAction={
                <Stack direction="row" spacing={1}>
                  <Button onClick={() => openEdit(rule)} size="small">
                    編集
                  </Button>
                  <Button
                    color={rule.active ? "warning" : "primary"}
                    onClick={() => void setActive({ ruleId: rule._id, active: !rule.active })}
                    size="small"
                  >
                    {rule.active ? "停止" : "再開"}
                  </Button>
                </Stack>
              }
            >
              <ListItemText
                primary={`${rule.kind === "income" ? "収入" : "支出"}・${rule.title}・${rule.amountYen.toLocaleString()}円`}
                secondary={`${recurringRuleScheduleLabel(rule)}${rule.active ? "" : "（停止中）"}`}
              />
            </ListItem>
          ))}
        </List>
      )}

      <Dialog fullWidth maxWidth="sm" onClose={() => setDialogOpen(false)} open={dialogOpen}>
        <DialogTitle>{editingId === null ? "定期定義を追加" : "定期定義を編集"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <ToggleButtonGroup
              exclusive
              onChange={(_e, value: EntryKind | null) => {
                if (value) setForm((f) => ({ ...f, kind: value }));
              }}
              value={form.kind}
            >
              <ToggleButton value="expense">支出</ToggleButton>
              <ToggleButton value="income">収入</ToggleButton>
            </ToggleButtonGroup>
            <TextField
              label="項目名"
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
              value={form.title}
            />
            <TextField
              label="金額（円）"
              onChange={(e) => setForm((f) => ({ ...f, amountYen: e.target.value }))}
              required
              slotProps={{ htmlInput: { inputMode: "numeric", pattern: "[0-9]*" } }}
              value={form.amountYen}
            />
            {form.kind === "expense" ? (
              <FormControl required>
                <InputLabel>カテゴリ</InputLabel>
                <Select
                  label="カテゴリ"
                  onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                  value={form.categoryId}
                >
                  {(categories ?? []).map((category) => (
                    <MenuItem key={category._id} value={category._id}>
                      {category.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : null}
            {form.kind === "expense" ? (
              <TextField
                label="店名（任意）"
                onChange={(e) => setForm((f) => ({ ...f, shopName: e.target.value }))}
                value={form.shopName}
              />
            ) : null}
            {form.kind === "expense" ? (
              <TextField
                label="メモ（任意）"
                onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
                value={form.memo}
              />
            ) : null}
            <ToggleButtonGroup
              exclusive
              onChange={(_e, value: "weekly" | "monthly" | null) => {
                if (value) setForm((f) => ({ ...f, frequency: value }));
              }}
              value={form.frequency}
            >
              <ToggleButton value="weekly">毎週</ToggleButton>
              <ToggleButton value="monthly">毎月</ToggleButton>
            </ToggleButtonGroup>
            {form.frequency === "weekly" ? (
              <FormControl required>
                <InputLabel>曜日</InputLabel>
                <Select
                  label="曜日"
                  onChange={(e) => setForm((f) => ({ ...f, dayOfWeek: Number(e.target.value) }))}
                  value={form.dayOfWeek}
                >
                  {["日", "月", "火", "水", "木", "金", "土"].map((label, index) => (
                    <MenuItem key={label} value={index}>
                      {label}曜日
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : (
              <TextField
                helperText="月末を超える日付はその月の末日になります"
                label="日付（1〜31）"
                onChange={(e) => setForm((f) => ({ ...f, dayOfMonth: Number(e.target.value) }))}
                required
                slotProps={{ htmlInput: { inputMode: "numeric", min: 1, max: 31 } }}
                type="number"
                value={form.dayOfMonth}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>キャンセル</Button>
          <Button
            disabled={!formValid || saving}
            onClick={() => void handleSave()}
            variant="contained"
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

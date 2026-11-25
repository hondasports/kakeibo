import { useState } from "react";
import { Alert, Button, List, ListItem, Paper, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { getTodayDateStringInJapan } from "../../../../lib/domain/common/date";
import { ENTRY_KIND_LABELS } from "../../../../lib/domain/common/entryKind";
import { formatYen } from "../../../../lib/domain/common/currency";
import {
  isRuleDue,
  latestOccurrenceDate,
} from "../../../../lib/domain/recurringRules/recurringRule";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function recurringRuleScheduleLabel(rule: Doc<"recurringEntryRules">): string {
  if (rule.frequency === "weekly") {
    return `毎週${WEEKDAYS[rule.dayOfWeek ?? 0]}曜日`;
  }
  return `毎月${rule.dayOfMonth ?? 1}日`;
}

function dueRules(rules: Doc<"recurringEntryRules">[], today: string) {
  return rules
    .filter((rule) => isRuleDue(rule, today))
    .map((rule) => ({ rule, occurrence: latestOccurrenceDate(rule, today) }));
}

export function RecurringDueSection() {
  const rules = useQuery(api.recurringRules.index.listRecurringRules);
  const register = useMutation(api.recurringRules.index.registerFromRecurringRule);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = getTodayDateStringInJapan();
  const due = rules === undefined ? [] : dueRules(rules, today);
  if (rules === undefined || due.length === 0) {
    return null;
  }

  const handleRegister = async (ruleId: Id<"recurringEntryRules">, label: string) => {
    setRegisteringId(ruleId);
    setMessage(null);
    setError(null);
    try {
      const result = await register({ ruleId });
      if (result.registered) {
        setMessage(`${label}を${result.date}の記録として登録しました`);
      } else {
        setMessage("この定期定義はすでに登録済みです");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登録に失敗しました");
    } finally {
      setRegisteringId(null);
    }
  };

  return (
    <Paper className="paper-panel" elevation={0} sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Typography component="h2" variant="subtitle1">
          期日が来た定期定義
        </Typography>
        <Typography color="text.secondary" variant="body2">
          登録するとその日付の支出・収入として記録されます。定期定義の追加・編集は
          <RouterLink to="/settings">設定</RouterLink>
          から行えます。
        </Typography>
        {message ? <Alert severity="success">{message}</Alert> : null}
        {error ? <Alert severity="error">{error}</Alert> : null}
        <List disablePadding>
          {due.map(({ rule, occurrence }) => (
            <ListItem
              disableGutters
              key={rule._id}
              secondaryAction={
                <Button
                  disabled={registeringId === rule._id}
                  onClick={() =>
                    handleRegister(rule._id, `${ENTRY_KIND_LABELS[rule.kind]}「${rule.title}」`)
                  }
                  size="small"
                  variant="contained"
                >
                  {occurrence}分を登録
                </Button>
              }
            >
              <Stack spacing={0.25}>
                <Typography variant="body2">
                  {ENTRY_KIND_LABELS[rule.kind]}・{rule.title}・{formatYen(rule.amountYen)}
                </Typography>
                <Typography color="text.secondary" variant="caption">
                  {recurringRuleScheduleLabel(rule)}
                </Typography>
              </Stack>
            </ListItem>
          ))}
        </List>
      </Stack>
    </Paper>
  );
}

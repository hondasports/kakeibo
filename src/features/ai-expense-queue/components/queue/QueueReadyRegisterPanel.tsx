import { useState } from "react";
import { Button, Stack, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import type { AiExpenseQueueItem } from "../../../../types/aiExpenseQueue";
import type { AiExpenseQueueBatchSummary } from "../../types/types";
import { formatYen } from "../../../../../lib/domain/common/currency";
import { BulkRegisterConfirmDialog } from "../BulkRegisterConfirmDialog";

type QueueReadyRegisterPanelProps = {
  readyItems: AiExpenseQueueItem[];
  selectedReadyIds: string[];
  registeringIds: string[];
  onRegisterReady: (itemIds?: string[]) => Promise<void>;
  batchSummary?: AiExpenseQueueBatchSummary;
};

export function QueueReadyRegisterPanel({
  readyItems,
  selectedReadyIds,
  registeringIds,
  onRegisterReady,
  batchSummary,
}: QueueReadyRegisterPanelProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmInFlight, setConfirmInFlight] = useState(false);

  const readyItemIds = readyItems.map((item) => item.id);
  const selectedBatchReadyIds = readyItemIds.filter((id) => selectedReadyIds.includes(id));
  const registrationIds = batchSummary ? readyItemIds : selectedReadyIds;
  const canRegisterBatch =
    !batchSummary ||
    (batchSummary.isAllReady &&
      readyItemIds.length > 0 &&
      selectedBatchReadyIds.length === readyItemIds.length);
  const selectedCount = batchSummary ? selectedBatchReadyIds.length : selectedReadyIds.length;
  const selectedTotalAmountYen = readyItems
    .filter((item) =>
      batchSummary ? selectedBatchReadyIds.includes(item.id) : selectedReadyIds.includes(item.id),
    )
    .reduce((total, item) => total + (item.amountYen ?? 0), 0);
  const isRegisterDisabled =
    !canRegisterBatch ||
    (!batchSummary && selectedReadyIds.length === 0) ||
    registeringIds.length > 0;
  const disabledReason = (() => {
    if (!isRegisterDisabled) {
      return null;
    }
    if (batchSummary) {
      if (!batchSummary.isAllReady) {
        if (batchSummary.processingCount > 0) {
          return "解析が終わるまで登録できません";
        }
        const unresolvedCount =
          batchSummary.needsReviewCount + batchSummary.failedCount + batchSummary.missingCount;
        if (unresolvedCount > 0) {
          return "すべての下書きが登録できる状態になると登録できます";
        }
        return "登録済みの下書きを含むため、この追加分はまとめて登録できません";
      }
      if (selectedBatchReadyIds.length !== readyItemIds.length) {
        return selectedBatchReadyIds.length === 0
          ? "登録する下書きにチェックを入れてください"
          : "すべての下書きを選択すると登録できます";
      }
    } else if (selectedReadyIds.length === 0) {
      return "登録する下書きにチェックを入れてください";
    }
    return "登録処理中です";
  })();
  const disabledReasonId = `queue-register-disabled-reason-${batchSummary?.batchId ?? "default"}`;

  const handleConfirmRegister = async () => {
    if (confirmInFlight) {
      return;
    }
    setConfirmInFlight(true);
    try {
      await onRegisterReady(registrationIds);
      setConfirmOpen(false);
    } finally {
      setConfirmInFlight(false);
    }
  };

  if (readyItems.length === 0 && !batchSummary) {
    return null;
  }

  return (
    <Stack spacing={1}>
      {batchSummary ? (
        <>
          <Typography variant="body2">
            今回の追加 {batchSummary.readyCount}/{batchSummary.totalCount}件が登録できます
          </Typography>
          <Typography color="text.secondary" variant="body2">
            {[
              batchSummary.queuedCount > 0 && `解析待ち ${batchSummary.queuedCount}件`,
              batchSummary.analyzingCount > 0 && `解析中 ${batchSummary.analyzingCount}件`,
              batchSummary.needsReviewCount > 0 && `確認待ち ${batchSummary.needsReviewCount}件`,
              batchSummary.failedCount > 0 && `読み取り失敗 ${batchSummary.failedCount}件`,
              batchSummary.missingCount > 0 && `読み取り結果待ち ${batchSummary.missingCount}件`,
            ]
              .filter(Boolean)
              .join(" ・ ") || "すべて確認できます"}
          </Typography>
        </>
      ) : (
        <Typography variant="body2">
          登録できる下書きが{readyItems.length}件あります
          {selectedReadyIds.length > 0 &&
            `（選択中 ${selectedReadyIds.length}件 / 合計 ${formatYen(selectedTotalAmountYen)}）`}
        </Typography>
      )}
      <Button
        aria-describedby={disabledReason ? disabledReasonId : undefined}
        color="primary"
        startIcon={<CheckCircleIcon />}
        disabled={isRegisterDisabled}
        onClick={() => setConfirmOpen(true)}
        type="button"
        variant="contained"
        sx={{ alignSelf: { xs: "stretch", md: "flex-start" } }}
      >
        まとめて登録（{batchSummary ? readyItems.length : selectedReadyIds.length}件）
      </Button>
      {disabledReason && (
        <Typography color="text.secondary" id={disabledReasonId} variant="body2">
          {disabledReason}
        </Typography>
      )}

      <BulkRegisterConfirmDialog
        confirmDisabled={confirmInFlight || registeringIds.length > 0}
        count={selectedCount}
        open={confirmOpen}
        totalAmountYen={selectedTotalAmountYen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void handleConfirmRegister()}
      />
    </Stack>
  );
}

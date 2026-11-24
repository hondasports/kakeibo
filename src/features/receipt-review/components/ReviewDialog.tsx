import { useEffect, useMemo, useRef, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Skeleton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import type {
  AiExpenseDraft,
  ReviewFormValues,
  ReviewItemValues,
} from "../../../../lib/domain/aiExpenseDrafts/reviewTypes";
import type { AiExpenseQueueCategory } from "../../../types/aiExpenseQueue";
import type { AmountBasis } from "../../../../lib/domain/receipt/tax/types";
import { getReviewSubmitLabel, ReviewDialogActions } from "./ReviewDialogActions";
import { ReviewDialogBasicsSection } from "./ReviewDialogBasicsSection";
import { ReviewDialogItemsSection } from "./ReviewDialogItemsSection";
import { ReviewDialogReferenceSection } from "./ReviewDialogReferenceSection";
import { ReviewCheckChips } from "./ReviewCheckChips";
import { ReviewCheckCards } from "./ReviewCheckCards";
import { ReviewStatusBanner } from "./ReviewStatusBanner";
import {
  getReviewGuidance,
  effectiveReviewMode,
} from "../../../../lib/domain/aiExpenseDrafts/reviewGuidance";
import { countActionableUncomparable } from "../../../../lib/domain/aiExpenseDrafts/reviewChecks";
import { judgeReviewFormAmountAndTax } from "../../../../lib/domain/aiExpenseDrafts/reviewFormJudgment";
import { isUnrelatedToAmountTaxGuidanceId } from "../../../../lib/domain/aiExpenseDrafts/reviewJudgment";
import { isDiscountLine } from "../../../../lib/domain/receipt/discountItems";
import { getReviewSubmitErrorMessage } from "../../../../lib/domain/aiExpenseDrafts/reviewValidation";
import {
  buildReviewTaxEvidence,
  buildReviewTaxPreview,
} from "../../../../lib/domain/aiExpenseDrafts/reviewItemsTaxPreview";
import { hasReceiptTaxMetadata } from "../../../../lib/domain/receipt/tax/draftTaxMapping";

type ReviewDialogProps = {
  open: boolean;
  categories: AiExpenseQueueCategory[];
  isReviewDraftLoading: boolean;
  isReviewDraftNotFound: boolean;
  selectedReviewDraft: AiExpenseDraft | null;
  reviewError: string;
  reviewForm: ReviewFormValues;
  reviewItems: ReviewItemValues[];
  persistedReviewItems?: AiExpenseDraft["items"];
  isCategorySplit: boolean;
  reviewSubmitting: boolean;
  onClose: () => void;
  onFieldChange: (field: keyof ReviewFormValues, value: string) => void;
  onItemChange: (
    itemId: string,
    field: keyof Pick<ReviewItemValues, "itemName" | "amountYen" | "categoryId" | "lineType">,
    value: string,
  ) => void;
  onAddItem: () => void;
  onRemoveItem: (itemId: string) => void;
  onCategorySplitChange: (split: boolean) => void;
  onAssignCategoryToItems: (itemIds: string[], categoryId: string) => void;
  onDiscountTargetChange: (discountItemId: string, targetItemId: string) => void;
  onSubmit: (
    registerAfterUpdate: boolean,
    registrationModeOverride?: ReviewFormValues["registrationMode"],
  ) => void;
  onResetToAiInterpretation: () => void;
  taxUpdatingItemId?: string | null;
  onTaxRateChange?: (itemId: string, taxRatePercent: 0 | 8 | 10 | null) => void;
  onConfirmItemTax?: (itemId: string, taxRatePercent: 0 | 8 | 10, amountBasis: AmountBasis) => void;
  imageDataUrl?: string;
  onAmountBasisChange?: (itemId: string, amountBasis: AmountBasis) => void;
};

export function ReviewDialog(props: ReviewDialogProps) {
  const {
    open,
    categories,
    selectedReviewDraft: sourceDraft,
    reviewForm: form,
    reviewItems: sourceItems,
    onFieldChange,
    onSubmit,
    reviewError,
    isReviewDraftLoading,
    isReviewDraftNotFound,
  } = props;
  const paidTotalYen =
    form.amountYen.trim() !== "" && Number.isFinite(Number(form.amountYen))
      ? Number(form.amountYen)
      : undefined;
  const preview = useMemo(
    () =>
      buildReviewTaxPreview(sourceItems, {
        ...buildReviewTaxEvidence(sourceDraft),
        paidTotalYen,
      }),
    [sourceItems, paidTotalYen, sourceDraft],
  );
  // 税サマリのない応答では、個別修正で確定した登録額を再描画だけで上書きしない。
  const items = sourceDraft?.taxSummaries?.length ? preview.items : sourceItems;
  const draft = sourceDraft ? { ...sourceDraft, taxSummaries: preview.taxSummaries } : null;
  const small = useMediaQuery(useTheme().breakpoints.down("sm"));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [taxDetails, setTaxDetails] = useState<Record<string, boolean>>({});
  const [localError, setLocalError] = useState("");
  const sections = useRef(new Map<string, HTMLElement>());
  const pendingJump = useRef<string | null>(null);
  const dialogKey = `${draft?._id ?? ""}:${open}`;
  const lastDialogKey = useRef(dialogKey);
  const [resetDialogKey, setResetDialogKey] = useState(dialogKey);
  if (resetDialogKey !== dialogKey) {
    setResetDialogKey(dialogKey);
    setExpanded({});
    setTaxDetails({});
    setLocalError("");
  }
  const taxModelActive = draft ? hasReceiptTaxMetadata(draft, items) : false;
  const guidance = getReviewGuidance(form, items, draft);
  const required = guidance.filter((issue) => issue.required);
  const recommendations = guidance.filter((issue) => !issue.required && issue.scope !== "receipt");
  const receiptGuidance = guidance.filter((issue) => issue.scope === "receipt");
  const specificGuidance = guidance.filter((issue) => issue.scope !== "receipt");
  const itemTargets = new Set(items.map((item) => item.id));
  const totalOnly = effectiveReviewMode(form) === "totalOnly";
  const judgment = judgeReviewFormAmountAndTax(
    {
      ...(sourceDraft ?? { documentType: form.documentType, reviewReasons: [] }),
      items: props.persistedReviewItems ?? sourceDraft?.items,
    },
    form,
    sourceItems,
  );
  const checks = judgment.checks;
  const matchedButUnresolved =
    judgment.status === "unresolved" &&
    checks.amount.status === "matched" &&
    checks.taxRate.status === "matched";
  const bannerGuidance = specificGuidance.filter(
    (issue) =>
      issue.taxSummaryIndex !== undefined ||
      (issue.required && issue.target !== "items" && !itemTargets.has(issue.target)) ||
      (matchedButUnresolved && !isUnrelatedToAmountTaxGuidanceId(issue.id)),
  );
  // 金額が一致し登録額も決まっていれば、確認の案内・件数・結果カードを出さず一致の表示だけにする（Issue #1563）。
  const amountConfirmed =
    judgment.status === "resolved" && checks.amount.status === "matched" && required.length === 0;
  const unresolvedTaxItemCount = amountConfirmed ? 0 : judgment.unresolvedTaxItemCount;
  const evidenceOnly = judgment.status === "resolved";
  const basisConflictItemCount = evidenceOnly
    ? 0
    : new Set([
        ...(checks.amount.blockerCode === "basis-conflict"
          ? (checks.amount.affectedItemIds ?? [])
          : []),
        ...(checks.taxRate.blockerCode === "basis-conflict"
          ? (checks.taxRate.affectedItemIds ?? [])
          : []),
      ]).size;
  const printedTaxMismatch = evidenceOnly && checks.taxRate.status === "mismatch";
  const checkMismatchCount =
    Number(checks.amount.status === "mismatch") +
    Number(!printedTaxMismatch && checks.taxRate.status === "mismatch");
  const checkUncomparableCount = countActionableUncomparable(checks, recommendations);
  const fixCount = required.length + checkMismatchCount;
  const recommendationCount = amountConfirmed
    ? 0
    : recommendations.length +
      checkUncomparableCount +
      Number(
        printedTaxMismatch && !recommendations.some((issue) => issue.taxSummaryIndex !== undefined),
      );
  const busy = props.reviewSubmitting || props.taxUpdatingItemId != null;
  const unavailable = isReviewDraftLoading || isReviewDraftNotFound || categories.length === 0;
  const submitLabel = getReviewSubmitLabel({
    requiredCount: required.length,
    totalOnly,
    checkMismatchCount,
    recommendationCount,
  });
  const products = items.filter((item) => !isDiscountLine(item.itemName, item.lineType));
  const categoryNames = new Map(categories.map((category) => [category._id, category.name]));

  const goTo = (target: string) => {
    setExpanded((current) => ({
      ...current,
      [target]: true,
    }));
    pendingJump.current = target;
  };
  useEffect(() => {
    if (lastDialogKey.current !== dialogKey) {
      lastDialogKey.current = dialogKey;
      pendingJump.current = null;
    }
    const target = pendingJump.current;
    if (target === null) return;
    pendingJump.current = null;
    const section = sections.current.get(target);
    if (section?.tagName === "DETAILS") section.setAttribute("open", "");
    section?.scrollIntoView?.({ block: "start", behavior: "instant" });
    const invalid = section?.querySelector<HTMLElement>(
      '[role="combobox"][aria-invalid="true"],input[aria-invalid="true"]:not([aria-hidden="true"])',
    );
    const field = section?.querySelector<HTMLElement>(
      'input:not([aria-hidden="true"]),[role="combobox"]',
    );
    (invalid ?? field ?? section)?.focus();
  });
  const register = (target: string) => (node: HTMLElement | null) => {
    if (node) sections.current.set(target, node);
    else sections.current.delete(target);
  };
  const toggleExpanded = (key: string) =>
    setExpanded((current) => ({ ...current, [key]: !current[key] }));
  const openExpanded = (key: string) => setExpanded((current) => ({ ...current, [key]: true }));
  const save = () => {
    const validation = getReviewSubmitErrorMessage(
      { ...form, registrationMode: effectiveReviewMode(form) },
      items,
    );
    if (validation) {
      setLocalError(validation);
      goTo(required[0]?.target ?? "basics");
      return;
    }
    setLocalError("");
    onSubmit(false, effectiveReviewMode(form));
  };
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : props.onClose}
      fullWidth
      fullScreen={small}
      maxWidth="lg"
      slotProps={{
        paper: { sx: { overscrollBehavior: "contain", height: { sm: "min(900px, 92dvh)" } } },
      }}
    >
      <DialogTitle sx={{ pb: 1, display: "flex", alignItems: "center" }}>
        <Box component="span" sx={{ flexGrow: 1 }}>
          下書き確認
        </Box>
        <IconButton
          aria-label="閉じる"
          disabled={busy}
          onClick={props.onClose}
          size="small"
          sx={{ mr: -1 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: { xs: 2, sm: 3 } }}>
        {isReviewDraftLoading ? (
          <Stack aria-label="下書きを読み込んでいます" role="status" spacing={2}>
            <Skeleton height={20} width="70%" />
            <Skeleton height={44} variant="rounded" />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <Skeleton height={44} variant="rounded" />
              <Skeleton height={44} variant="rounded" />
              <Skeleton height={44} variant="rounded" />
            </Stack>
            <Skeleton height={44} variant="rounded" />
            <Stack spacing={1}>
              <Skeleton height={64} variant="rounded" />
              <Skeleton height={64} variant="rounded" />
              <Skeleton height={64} variant="rounded" />
            </Stack>
          </Stack>
        ) : isReviewDraftNotFound ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" onClick={props.onClose} size="small" type="button">
                閉じる
              </Button>
            }
          >
            下書きが見つかりません。閉じて一覧を更新し、もう一度確認してください。
          </Alert>
        ) : (
          <>
            {!categories.length && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                カテゴリを読み込めていません。カテゴリ設定と接続状態を確認してください。
              </Alert>
            )}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: props.imageDataUrl
                  ? { xs: "minmax(0,1fr)", md: "minmax(220px,0.7fr) minmax(0,1.3fr)" }
                  : "minmax(0,1fr)",
                gap: 3,
                alignItems: "start",
              }}
            >
              {props.imageDataUrl && (
                <Box
                  component="aside"
                  aria-label="レシート画像"
                  sx={{
                    display: { xs: "none", md: "block" },
                    position: { md: "sticky" },
                    top: 0,
                    minWidth: 0,
                  }}
                >
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    読み取り元のレシート
                  </Typography>
                  <Box
                    component="img"
                    src={props.imageDataUrl}
                    alt="読み取り元のレシート"
                    sx={{
                      width: "100%",
                      maxHeight: "70dvh",
                      objectFit: "contain",
                      objectPosition: "top",
                    }}
                  />
                </Box>
              )}
              <Stack spacing={2.5} sx={{ minWidth: 0 }}>
                {props.imageDataUrl && (
                  <Box
                    component="details"
                    sx={{ display: { xs: "block", md: "none" }, minWidth: 0 }}
                  >
                    <Typography
                      component="summary"
                      variant="body2"
                      color="text.secondary"
                      sx={{ cursor: "pointer" }}
                    >
                      レシート画像を表示
                    </Typography>
                    <Box
                      component="img"
                      src={props.imageDataUrl}
                      alt="読み取り元のレシート"
                      sx={{
                        width: "100%",
                        maxHeight: "50dvh",
                        objectFit: "contain",
                        objectPosition: "top",
                        mt: 1,
                      }}
                    />
                  </Box>
                )}
                <Typography
                  variant="body2"
                  color="text.secondary"
                  aria-label="保存状態"
                  aria-live="polite"
                >
                  {busy
                    ? "変更を保存しています…"
                    : reviewError
                      ? "変更を保存できませんでした。内容を確認して再試行してください。"
                      : required.length > 0
                        ? "修正が必要な項目を直すと下書きに保存できます。登録は一覧の「登録する」から行います。"
                        : `入力した内容は「${submitLabel}」で下書きに保存されます。登録は一覧の「登録する」から行います。`}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  閉じると未保存の入力は失われます。
                </Typography>
                <ReviewDialogBasicsSection
                  form={form}
                  categories={categories}
                  documentOpen={expanded.document ?? form.documentType === "unknown"}
                  busy={busy}
                  register={register}
                  onToggleDocument={() =>
                    setExpanded((current) => ({
                      ...current,
                      document: !(current.document ?? form.documentType === "unknown"),
                    }))
                  }
                  onFieldChange={onFieldChange}
                />
                {!amountConfirmed && (
                  <ReviewCheckChips
                    fixCount={fixCount}
                    recommendationCount={recommendationCount}
                    basisConflictItemCount={basisConflictItemCount}
                    unresolvedTaxItemCount={unresolvedTaxItemCount}
                  />
                )}
                <ReviewStatusBanner
                  checks={checks}
                  amountTaxResolved={judgment.status !== "unresolved"}
                  amountConfirmed={amountConfirmed}
                  itemCount={items.length}
                  issues={amountConfirmed ? [] : bannerGuidance}
                  unresolvedTaxItemCount={unresolvedTaxItemCount}
                  receiptIssues={amountConfirmed ? [] : receiptGuidance}
                  busy={busy}
                  onJump={goTo}
                />
                {!amountConfirmed && (
                  <ReviewCheckCards
                    amount={checks.amount}
                    taxRate={checks.taxRate}
                    evidence={sourceDraft?.receiptTaxDecision?.evidence}
                  />
                )}
                <ReviewDialogItemsSection
                  items={items}
                  products={products}
                  guidance={amountConfirmed ? [] : guidance}
                  expanded={expanded}
                  taxDetails={taxDetails}
                  busy={busy}
                  categories={categories}
                  categoryNames={categoryNames}
                  isCategorySplit={props.isCategorySplit}
                  draft={draft}
                  totalOnly={totalOnly}
                  taxModelActive={taxModelActive}
                  taxUpdatingItemId={props.taxUpdatingItemId}
                  register={register}
                  onToggleItem={toggleExpanded}
                  onOpenItem={openExpanded}
                  onToggleTaxDetail={(itemId) =>
                    setTaxDetails((current) => ({
                      ...current,
                      [itemId]: !current[itemId],
                    }))
                  }
                  onCategorySplitChange={props.onCategorySplitChange}
                  onAddItem={props.onAddItem}
                  onRemoveItem={props.onRemoveItem}
                  onItemChange={props.onItemChange}
                  onAssignCategoryToItems={props.onAssignCategoryToItems}
                  onDiscountTargetChange={props.onDiscountTargetChange}
                  onTaxRateChange={props.onTaxRateChange}
                  onConfirmItemTax={props.onConfirmItemTax}
                  onAmountBasisChange={props.onAmountBasisChange}
                />
                <ReviewDialogReferenceSection
                  draft={draft}
                  open={expanded.reference ?? false}
                  busy={busy}
                  register={register}
                  onToggle={() => toggleExpanded("reference")}
                  onResetToAiInterpretation={props.onResetToAiInterpretation}
                />
              </Stack>
            </Box>
          </>
        )}
      </DialogContent>
      <ReviewDialogActions
        reviewError={localError || reviewError}
        busy={busy}
        unavailable={unavailable}
        requiredCount={required.length}
        checkMismatchCount={checkMismatchCount}
        recommendationCount={recommendationCount}
        unresolvedTaxItemCount={unresolvedTaxItemCount}
        basisConflictItemCount={basisConflictItemCount}
        totalOnly={totalOnly}
        amountConfirmed={amountConfirmed}
        onClose={props.onClose}
        onSubmit={save}
        onReviewRequired={() => goTo(required[0]?.target ?? "basics")}
      />
    </Dialog>
  );
}

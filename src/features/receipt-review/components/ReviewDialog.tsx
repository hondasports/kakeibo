import { useEffect, useRef, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import {
  Alert,
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import type { AiExpenseDraft, ReviewFormValues, ReviewItemValues } from "../types/types";
import type { AiExpenseQueueCategory } from "../../ai-expense-queue/types/types";
import type { TaxSummaryChange } from "./ReceiptTaxSummaryEditor";
import type { AmountBasis } from "../../../../lib/receiptTax/types";
import { ReviewDialogActions } from "./ReviewDialogActions";
import { ReviewDialogBasicsSection } from "./ReviewDialogBasicsSection";
import { ReviewDialogItemsSection } from "./ReviewDialogItemsSection";
import { ReviewDialogReferenceSection } from "./ReviewDialogReferenceSection";
import { ReviewCheckChips } from "./ReviewCheckChips";
import { ReviewCheckCards } from "./ReviewCheckCards";
import { ReviewStatusBanner } from "./ReviewStatusBanner";
import { getReviewGuidance, effectiveReviewMode } from "../utils/reviewGuidance";
import { buildReviewChecks } from "../utils/reviewChecks";
import { buildTaxContextFromReviewItem } from "../utils/receiptItemTaxViewModel";
import { isDiscountLine } from "../utils/discountItems";
import { getReviewSubmitError } from "../utils/reviewValidation";

export type ReviewDialogProps = {
  open: boolean;
  categories: AiExpenseQueueCategory[];
  isReviewDraftLoading: boolean;
  isReviewDraftNotFound: boolean;
  selectedReviewDraft: AiExpenseDraft | null;
  reviewError: string;
  reviewForm: ReviewFormValues;
  reviewItems: ReviewItemValues[];
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
  taxSummaryUpdatingIndex?: number | null;
  onTaxSummaryChange?: (index: number, change: TaxSummaryChange) => void;
  imageDataUrl?: string;
  onAmountBasisChange?: (itemId: string, amountBasis: AmountBasis) => void;
};

export function ReviewDialog(props: ReviewDialogProps) {
  const {
    open,
    categories,
    selectedReviewDraft: draft,
    reviewForm: form,
    reviewItems: items,
    onFieldChange,
    onSubmit,
    reviewError,
    isReviewDraftLoading,
    isReviewDraftNotFound,
  } = props;
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
  const guidance = getReviewGuidance(form, items, draft);
  const required = guidance.filter((issue) => issue.required);
  const recommendations = guidance.filter((issue) => !issue.required && issue.scope !== "receipt");
  const receiptGuidance = guidance.filter((issue) => issue.scope === "receipt");
  const specificGuidance = guidance.filter((issue) => issue.scope !== "receipt");
  const itemTargets = new Set(items.map((item) => item.id));
  const bannerGuidance = specificGuidance.filter(
    (issue) =>
      issue.required &&
      issue.target !== "items" &&
      issue.target !== "tax-summary" &&
      !itemTargets.has(issue.target),
  );
  const totalOnly = effectiveReviewMode(form) === "totalOnly";
  const paidTotalYen =
    form.amountYen.trim() !== "" && Number.isFinite(Number(form.amountYen))
      ? Number(form.amountYen)
      : undefined;
  const checks = buildReviewChecks({
    items,
    paidTotalYen,
    taxSummaries: draft?.taxSummaries,
    rawObservation: draft?.rawObservation,
  });
  const unresolvedTaxItemCount = items.filter(
    (item) => buildTaxContextFromReviewItem(item).status === "unresolved",
  ).length;
  const basisConflictItemCount = new Set([
    ...(checks.amount.blockerCode === "basis-conflict"
      ? (checks.amount.affectedItemIds ?? [])
      : []),
    ...(checks.taxRate.blockerCode === "basis-conflict"
      ? (checks.taxRate.affectedItemIds ?? [])
      : []),
  ]).size;
  const checkMismatchCount = [checks.amount, checks.taxRate].filter(
    (check) => check.status === "mismatch",
  ).length;
  const checkUncomparableCount = [checks.amount, checks.taxRate].filter(
    (check) => check.status === "uncomparable",
  ).length;
  const fixCount = required.length + checkMismatchCount;
  const recommendationCount = recommendations.length + checkUncomparableCount;
  const busy =
    props.reviewSubmitting ||
    props.taxUpdatingItemId != null ||
    props.taxSummaryUpdatingIndex != null;
  const unavailable = isReviewDraftLoading || isReviewDraftNotFound || categories.length === 0;
  const products = items.filter((item) => !isDiscountLine(item.itemName, item.lineType));
  const categoryNames = new Map(categories.map((category) => [category._id, category.name]));
  const canEditTax = Boolean(draft?.taxSummaries?.length);
  const goTo = (target: string) => {
    setExpanded((current) => ({
      ...current,
      [target]: true,
      ...(target === "tax-summary" ? { reference: true } : {}),
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
    const validation = getReviewSubmitError(
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
          <Typography>下書きを読み込んでいます。</Typography>
        ) : isReviewDraftNotFound ? (
          <Alert severity="error">
            下書きが見つかりません。一覧を更新してもう一度確認してください。
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
                <ReviewCheckChips
                  fixCount={fixCount}
                  recommendationCount={recommendationCount}
                  basisConflictItemCount={basisConflictItemCount}
                  unresolvedTaxItemCount={unresolvedTaxItemCount}
                />
                <ReviewStatusBanner
                  checks={checks}
                  issues={bannerGuidance}
                  unresolvedTaxItemCount={unresolvedTaxItemCount}
                  receiptIssues={receiptGuidance}
                  busy={busy}
                  onJump={goTo}
                />
                <ReviewCheckCards amount={checks.amount} taxRate={checks.taxRate} />
                <ReviewDialogItemsSection
                  items={items}
                  products={products}
                  guidance={guidance}
                  expanded={expanded}
                  taxDetails={taxDetails}
                  busy={busy}
                  categories={categories}
                  categoryNames={categoryNames}
                  isCategorySplit={props.isCategorySplit}
                  draft={draft}
                  totalOnly={totalOnly}
                  canEditTax={canEditTax}
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
                  onAmountBasisChange={props.onAmountBasisChange}
                />
                <ReviewDialogReferenceSection
                  draft={draft}
                  canEditTax={canEditTax}
                  open={expanded.reference ?? false}
                  busy={busy}
                  taxSummaryUpdatingIndex={props.taxSummaryUpdatingIndex}
                  register={register}
                  onToggle={() => toggleExpanded("reference")}
                  onTaxSummaryChange={props.onTaxSummaryChange}
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
        onClose={props.onClose}
        onSubmit={save}
        onReviewRequired={() => goTo(required[0]?.target ?? "basics")}
      />
    </Dialog>
  );
}

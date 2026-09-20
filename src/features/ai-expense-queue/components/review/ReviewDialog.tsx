import { useEffect, useRef, useState } from "react";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloseIcon from "@mui/icons-material/Close";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import type {
  AiExpenseDraft,
  AiExpenseQueueCategory,
  ReviewFormValues,
  ReviewItemValues,
} from "../../types/types";
import type { TaxSummaryChange } from "./ReceiptTaxSummaryEditor";
import type { AmountBasis } from "../../../../../lib/receiptTax/types";
import { ReviewDialogActions } from "./ReviewDialogActions";
import { ReviewItemCard } from "./ReviewItemCard";
import { ReviewItemRow } from "./ReviewItemRow";
import { ReviewCheckCards } from "./ReviewCheckCards";
import { ReviewStatusBanner } from "./ReviewStatusBanner";
import { ReceiptTaxSummary } from "./ReceiptTaxSummary";
import { getReviewGuidance, effectiveReviewMode } from "../../utils/reviewGuidance";
import { buildReviewChecks } from "../../utils/reviewChecks";
import { buildTaxContextFromReviewItem } from "../../utils/receiptItemTaxViewModel";
import { isDiscountLine } from "../../utils/discountItems";
import { documentTypeLabels, reviewDocumentTypeOptions } from "../labels";
import { getReviewSubmitError } from "../../utils/reviewValidation";

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
  const [jump, setJump] = useState<string | null>(null);
  const [localError, setLocalError] = useState("");
  const sections = useRef(new Map<string, HTMLElement>());
  const guidance = getReviewGuidance(form, items, draft);
  const required = guidance.filter((issue) => issue.required);
  const recommendations = guidance.filter((issue) => !issue.required && issue.scope !== "receipt");
  const receiptGuidance = guidance.filter((issue) => issue.scope === "receipt");
  const specificGuidance = guidance.filter((issue) => issue.scope !== "receipt");
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
    setJump(target);
  };
  useEffect(() => {
    setExpanded({});
    setTaxDetails({});
    setLocalError("");
    setJump(null);
  }, [draft?._id, open]);
  useEffect(() => {
    if (!jump) return;
    const section = sections.current.get(jump);
    section?.scrollIntoView?.({ block: "start", behavior: "instant" });
    const invalid = section?.querySelector<HTMLElement>(
      '[role="combobox"][aria-invalid="true"],input[aria-invalid="true"]:not([aria-hidden="true"])',
    );
    const field = section?.querySelector<HTMLElement>(
      'input:not([aria-hidden="true"]),[role="combobox"]',
    );
    (invalid ?? field ?? section)?.focus();
    setJump(null);
  }, [jump, expanded]);
  const register = (target: string) => (node: HTMLElement | null) => {
    if (node) sections.current.set(target, node);
    else sections.current.delete(target);
  };
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
                <Box
                  component="fieldset"
                  disabled={busy}
                  inert={busy}
                  sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}
                >
                  <Box
                    component="section"
                    ref={register("basics")}
                    tabIndex={-1}
                    aria-label="レシートの基本情報"
                    sx={{ scrollMarginTop: 16 }}
                  >
                    <TextField
                      ref={register("shopName")}
                      variant="standard"
                      label="店名・内容"
                      fullWidth
                      value={form.shopName}
                      error={!form.shopName.trim()}
                      slotProps={{
                        htmlInput: { style: { fontSize: "1.25rem", fontWeight: 600 } },
                        inputLabel: { shrink: true },
                      }}
                      onChange={(event) => onFieldChange("shopName", event.target.value)}
                    />
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 1.5 }}>
                      <TextField
                        ref={register("date")}
                        variant="standard"
                        label="支出日（レシート記載日）"
                        type="date"
                        fullWidth
                        value={form.date}
                        slotProps={{ inputLabel: { shrink: true } }}
                        onChange={(event) => onFieldChange("date", event.target.value)}
                      />
                      <TextField
                        ref={register("amountYen")}
                        variant="standard"
                        label="合計金額"
                        fullWidth
                        value={form.amountYen}
                        slotProps={{ htmlInput: { inputMode: "numeric" } }}
                        onChange={(event) =>
                          onFieldChange("amountYen", event.target.value.replace(/[^\d]/g, ""))
                        }
                      />
                      <TextField
                        ref={register("categoryId")}
                        variant="standard"
                        label="レシート全体のカテゴリ"
                        select
                        fullWidth
                        value={form.categoryId}
                        error={!form.categoryId}
                        onChange={(event) => onFieldChange("categoryId", event.target.value)}
                      >
                        {categories.map((category) => (
                          <MenuItem key={category._id} value={category._id}>
                            {category.name}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Stack>
                    <Box
                      component="details"
                      ref={register("document")}
                      open={expanded.document ?? form.documentType === "unknown"}
                      sx={{ mt: 1 }}
                    >
                      <Typography
                        component="summary"
                        variant="body2"
                        color="text.secondary"
                        onClick={(event) => {
                          event.preventDefault();
                          setExpanded((current) => ({
                            ...current,
                            document: !(current.document ?? form.documentType === "unknown"),
                          }));
                        }}
                        sx={{ cursor: "pointer" }}
                      >
                        書類種別：{documentTypeLabels[form.documentType]}
                      </Typography>
                      <TextField
                        label="書類種別"
                        error={form.documentType === "unknown"}
                        select
                        fullWidth
                        value={form.documentType === "unknown" ? "" : form.documentType}
                        sx={{ mt: 1 }}
                        onChange={(event) => onFieldChange("documentType", event.target.value)}
                      >
                        <MenuItem value="" disabled>
                          書類種別を選択
                        </MenuItem>
                        {reviewDocumentTypeOptions.map(([value, label]) => (
                          <MenuItem key={value} value={value}>
                            {label}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Box>
                  </Box>
                </Box>
                <Stack
                  component="section"
                  aria-label="確認件数"
                  direction="row"
                  spacing={1}
                  sx={{ flexWrap: "wrap", rowGap: 0.5 }}
                >
                  <Chip
                    size="small"
                    variant="outlined"
                    color={fixCount ? "error" : "success"}
                    icon={fixCount ? undefined : <CheckCircleIcon />}
                    label={`修正必須 ${fixCount}件`}
                  />
                  <Chip
                    size="small"
                    variant="outlined"
                    color={recommendationCount ? "warning" : "success"}
                    icon={recommendationCount ? undefined : <CheckCircleIcon />}
                    label={`確認推奨 ${recommendationCount}件`}
                  />
                </Stack>
                <ReviewStatusBanner
                  checks={checks}
                  issues={specificGuidance}
                  receiptIssues={receiptGuidance}
                  busy={busy}
                  onJump={goTo}
                />
                <ReviewCheckCards amount={checks.amount} taxRate={checks.taxRate} />
                <Box
                  component="fieldset"
                  disabled={busy}
                  inert={busy}
                  sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}
                >
                  <Box
                    component="section"
                    ref={register("items")}
                    tabIndex={-1}
                    aria-label="商品一覧"
                    sx={{ scrollMarginTop: 16 }}
                  >
                    <Stack
                      direction="row"
                      sx={{
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        mb: 1,
                      }}
                    >
                      <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
                        商品一覧（{items.length}件）
                      </Typography>
                      <Stack direction="row" spacing={1}>
                        {products.length > 1 && (
                          <Button
                            disabled={busy}
                            type="button"
                            onClick={() => props.onCategorySplitChange(!props.isCategorySplit)}
                          >
                            {props.isCategorySplit ? "単一カテゴリに戻す" : "カテゴリを分ける"}
                          </Button>
                        )}
                        <Button disabled={busy} type="button" onClick={props.onAddItem}>
                          明細を追加
                        </Button>
                      </Stack>
                    </Stack>
                    {guidance
                      .filter((issue) => issue.target === "items" && issue.scope !== "receipt")
                      .map((issue) => (
                        <Alert
                          key={issue.id}
                          severity={issue.required ? "error" : "info"}
                          sx={{ mb: 1.5 }}
                        >
                          <Typography variant="subtitle2">
                            {issue.required ? "修正必須" : "確認推奨"}
                          </Typography>
                          {issue.message}
                        </Alert>
                      ))}
                    {totalOnly && (
                      <Alert severity="info" sx={{ mb: 1 }}>
                        税を推測せず、レシート合計だけで保存します。商品明細は確認用に残りますが、履歴・予算・カテゴリ集計には使われません。
                      </Alert>
                    )}
                    {!items.length && (
                      <Typography variant="body2">
                        明細はありません。レシートの合計とカテゴリを確認してください。
                      </Typography>
                    )}
                    {items.length > 0 && (
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{
                          display: { xs: "none", sm: "flex" },
                          px: 1.5,
                          mb: 0.5,
                          color: "text.secondary",
                        }}
                      >
                        <Typography variant="caption" sx={{ width: "1.5em", flexShrink: 0 }}>
                          No.
                        </Typography>
                        <Typography variant="caption" sx={{ flex: 1, minWidth: 0 }}>
                          商品名・内容
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ whiteSpace: "nowrap", flexShrink: 0, textAlign: "right" }}
                        >
                          金額
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ width: 88, flexShrink: 0, textAlign: "right" }}
                        >
                          税率
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ width: 88, flexShrink: 0, textAlign: "center" }}
                        >
                          操作
                        </Typography>
                      </Stack>
                    )}
                    <Stack spacing={1}>
                      {items.map((item, index) => {
                        const itemIssues = guidance.filter((issue) => issue.target === item.id);
                        const isOpen = expanded[item.id] ?? itemIssues.length > 0;
                        const target = products.find(
                          (product) => product.id === item.discountTargetItemId,
                        );
                        return (
                          <ReviewItemRow
                            key={item.id}
                            item={item}
                            index={index}
                            issues={itemIssues}
                            open={isOpen}
                            registerRef={register(item.id)}
                            onToggle={() =>
                              setExpanded((current) => ({ ...current, [item.id]: !isOpen }))
                            }
                            onOpen={() =>
                              setExpanded((current) => ({ ...current, [item.id]: true }))
                            }
                            busy={busy}
                            categoryName={categoryNames.get(item.categoryId)}
                            targetName={target?.itemName}
                          >
                            <Stack spacing={1}>
                              {itemIssues.map((issue) => (
                                <Alert key={issue.id} severity={issue.required ? "error" : "info"}>
                                  {issue.message}
                                </Alert>
                              ))}
                              <ReviewItemCard
                                embedded
                                item={item}
                                index={index}
                                categories={categories}
                                categoryNamesById={categoryNames}
                                productItems={products}
                                selectedReviewDraft={draft}
                                isCategorySplit={props.isCategorySplit}
                                isExpanded={taxDetails[item.id] ?? false}
                                taxUpdatingItemId={props.taxUpdatingItemId}
                                disabled={busy}
                                enableItemTaxEditing={!!item.persistedItemId}
                                inlineTaxEditing
                                onAmountBasisChange={props.onAmountBasisChange}
                                onItemChange={props.onItemChange}
                                onRemoveItem={props.onRemoveItem}
                                onAssignCategoryToItems={props.onAssignCategoryToItems}
                                onDiscountTargetChange={props.onDiscountTargetChange}
                                onTaxRateChange={props.onTaxRateChange}
                                onToggleDetail={() =>
                                  setTaxDetails((current) => ({
                                    ...current,
                                    [item.id]: !current[item.id],
                                  }))
                                }
                              />
                              {!canEditTax &&
                                buildTaxContextFromReviewItem(item).status === "unresolved" && (
                                  <Typography variant="body2" color="text.secondary">
                                    税内訳を読み取れていません。レシートと照合して税率・税込／税抜を確認してください。
                                  </Typography>
                                )}
                            </Stack>
                          </ReviewItemRow>
                        );
                      })}
                    </Stack>
                  </Box>
                </Box>
                <Box
                  component="details"
                  ref={register("reference")}
                  open={expanded.reference ?? false}
                  inert={busy}
                >
                  <Typography
                    component="summary"
                    onClick={(event) => {
                      event.preventDefault();
                      setExpanded((current) => ({ ...current, reference: !current.reference }));
                    }}
                    sx={{ cursor: "pointer" }}
                  >
                    読み取り原文・詳しい税情報（参考）
                  </Typography>
                  <Stack spacing={2} sx={{ mt: 1 }}>
                    {draft?.rawObservation?.lines.length ? (
                      <Box component="ol" aria-label="OCR原文" sx={{ pl: 3, m: 0 }}>
                        {draft.rawObservation.lines.map((line) => (
                          <Typography component="li" variant="body2" key={line.sourceLineIndex}>
                            {line.rawText}
                          </Typography>
                        ))}
                      </Box>
                    ) : (
                      <Typography variant="body2">読み取り原文はありません。</Typography>
                    )}
                    {canEditTax && (
                      <Box
                        component="section"
                        ref={register("tax-summary")}
                        tabIndex={-1}
                        aria-label="税内訳を確認"
                      >
                        <Typography component="h3" variant="subtitle2" sx={{ fontWeight: 700 }}>
                          税内訳を確認
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 1 }}>
                          税額が未確定の場合は、対象額が税込か税抜かをレシートと照合してください。割引も対象税率に含めて確認してください。
                        </Typography>
                        <ReceiptTaxSummary
                          draft={draft}
                          onSummaryChange={busy ? undefined : props.onTaxSummaryChange}
                          updatingIndex={props.taxSummaryUpdatingIndex}
                        />
                      </Box>
                    )}
                    {draft?.receiptInterpretation && draft.receiptUserOverride && (
                      <Button
                        disabled={busy}
                        color="warning"
                        type="button"
                        onClick={props.onResetToAiInterpretation}
                      >
                        AI判定へ戻す
                      </Button>
                    )}
                  </Stack>
                </Box>
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
        totalOnly={totalOnly}
        onClose={props.onClose}
        onSubmit={save}
        onReviewRequired={() => goTo(required[0]?.target ?? "basics")}
      />
    </Dialog>
  );
}

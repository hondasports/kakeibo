import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  MenuItem,
  Radio,
  RadioGroup,
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
import { ReceiptTaxSummary } from "./ReceiptTaxSummary";
import {
  getReviewGuidance,
  effectiveReviewMode,
  reviewSaveSummary,
} from "../../utils/reviewGuidance";
import { isDiscountLine } from "../../utils/discountItems";
import { documentTypeLabels, reviewDocumentTypeOptions } from "../labels";
import { getReviewSubmitError } from "../../utils/reviewValidation";
import { buildTaxContextFromReviewItem } from "../../utils/receiptItemTaxViewModel";

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
  const summary = reviewSaveSummary(form, items);
  const busy =
    props.reviewSubmitting ||
    props.taxUpdatingItemId != null ||
    props.taxSummaryUpdatingIndex != null;
  const unavailable = isReviewDraftLoading || isReviewDraftNotFound || categories.length === 0;
  const products = items.filter((item) => !isDiscountLine(item.itemName, item.lineType));
  const categoryNames = new Map(categories.map((category) => [category._id, category.name]));
  const canEditTax = Boolean(draft?.taxSummaries?.length);
  const unknownChoice =
    form.priceTaxTreatment === "unknown" || form.taxRateComposition === "unknown";
  const goTo = (target: string) => {
    setExpanded((current) => ({ ...current, [target]: true }));
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
  const setChoice = (field: "priceTaxTreatment" | "taxRateComposition", value: string) => {
    onFieldChange(field, value);
    if (value === "unknown") onFieldChange("registrationMode", "totalOnly");
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
      <DialogTitle sx={{ pb: 1 }}>下書き確認</DialogTitle>
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
              <Alert severity="warning">
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
                  sx={{ position: { md: "sticky" }, top: 0, minWidth: 0 }}
                >
                  <Box component="details" sx={{ display: { xs: "block", md: "none" } }}>
                    <Typography component="summary" sx={{ cursor: "pointer", py: 1 }}>
                      レシート画像を見ながら確認
                    </Typography>
                    <Box
                      component="img"
                      src={props.imageDataUrl}
                      alt="読み取り元のレシート"
                      sx={{ width: "100%" }}
                    />
                  </Box>
                  <Box sx={{ display: { xs: "none", md: "block" } }}>
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
                </Box>
              )}
              <Stack spacing={3} sx={{ minWidth: 0 }}>
                <Box>
                  <Typography component="h2" variant="h6">
                    {form.shopName || "店名・内容が未入力"}
                  </Typography>
                  <Typography color="text.secondary">
                    {form.date || "日付未入力"} ・{" "}
                    {form.amountYen ? `${Number(form.amountYen).toLocaleString()}円` : "金額未入力"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    読み取り内容を確認し、必要なところだけその場で直せます。
                  </Typography>
                </Box>
                <Box component="section" aria-label="確認すること">
                  <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: "wrap" }}>
                    <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
                      確認すること
                    </Typography>
                    <Chip
                      size="small"
                      color={required.length ? "error" : "default"}
                      label={`修正必須 ${required.length}件`}
                    />
                    <Chip
                      size="small"
                      variant="outlined"
                      label={`確認推奨 ${recommendations.length}件`}
                    />
                  </Stack>
                  {specificGuidance.length ? (
                    <Stack component="ul" spacing={1} sx={{ m: 0, pl: 2.5 }}>
                      {specificGuidance.map((issue) => (
                        <Box component="li" key={issue.id}>
                          <Typography
                            variant="body2"
                            color={issue.required ? "error.main" : "text.secondary"}
                          >
                            {issue.message}
                          </Typography>
                          <Button
                            disabled={busy}
                            type="button"
                            size="small"
                            onClick={() => goTo(issue.target)}
                          >
                            {issue.required ? "修正箇所へ" : "確認箇所へ"}
                          </Button>
                        </Box>
                      ))}
                    </Stack>
                  ) : (
                    <Typography variant="body2">
                      個別の修正・確認が必要な項目はありません。
                    </Typography>
                  )}
                  {receiptGuidance.map((issue) => (
                    <Alert key={issue.id} severity="info" sx={{ mt: 1.5 }}>
                      <Typography variant="subtitle2">レシート全体の確認</Typography>
                      {issue.message}
                      <Box>
                        <Button disabled={busy} size="small" onClick={() => goTo(issue.target)}>
                          商品一覧を見比べる
                        </Button>
                      </Box>
                    </Alert>
                  ))}
                </Box>
                <Box
                  component="fieldset"
                  disabled={busy}
                  inert={busy}
                  sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}
                >
                  <Stack spacing={3}>
                    <Box
                      component="section"
                      ref={register("basics")}
                      tabIndex={-1}
                      aria-label="レシートの基本情報"
                      sx={{ scrollMarginTop: 16 }}
                    >
                      <Typography
                        component="h3"
                        variant="subtitle1"
                        sx={{ fontWeight: 700, mb: 1.5 }}
                      >
                        レシートの基本情報
                      </Typography>
                      <Stack spacing={1.5}>
                        <TextField
                          ref={register("shopName")}
                          label="店名・内容"
                          fullWidth
                          value={form.shopName}
                          error={!form.shopName.trim()}
                          onChange={(event) => onFieldChange("shopName", event.target.value)}
                        />
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                          <TextField
                            ref={register("date")}
                            label="支出日（レシート記載日）"
                            type="date"
                            fullWidth
                            value={form.date}
                            slotProps={{ inputLabel: { shrink: true } }}
                            onChange={(event) => onFieldChange("date", event.target.value)}
                          />
                          <TextField
                            ref={register("amountYen")}
                            label="合計金額"
                            fullWidth
                            value={form.amountYen}
                            slotProps={{ htmlInput: { inputMode: "numeric" } }}
                            onChange={(event) =>
                              onFieldChange("amountYen", event.target.value.replace(/[^\d]/g, ""))
                            }
                          />
                        </Stack>
                        <TextField
                          ref={register("categoryId")}
                          label="レシート全体のカテゴリ"
                          select
                          fullWidth
                          disabled={busy}
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
                        <Box
                          component="details"
                          ref={register("document")}
                          open={expanded.document ?? form.documentType === "unknown"}
                        >
                          <Typography
                            component="summary"
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
                            disabled={busy}
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
                      </Stack>
                    </Box>
                    {items.length > 0 && (
                      <Box
                        component="section"
                        ref={register("tax")}
                        tabIndex={-1}
                        aria-label="レシート全体の税込・税率設定"
                        sx={{ scrollMarginTop: 16 }}
                      >
                        <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
                          レシート全体の税込・税率設定
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          選択すると、各商品の税込／税抜・税率をもとに登録額と税額を再計算します。結果は下の「商品と割引」「保存内容を確認」に表示されます。分からない場合は合計だけ保存できます。
                        </Typography>
                        <Stack spacing={1.5}>
                          <FormControl>
                            <FormLabel>1. 商品の表示価格はどれですか</FormLabel>
                            <RadioGroup
                              aria-label="1. 商品の表示価格はどれですか"
                              value={form.priceTaxTreatment ?? ""}
                              onChange={(event) =>
                                setChoice("priceTaxTreatment", event.target.value)
                              }
                            >
                              {[
                                ["included", "表示価格に税が含まれている"],
                                ["excluded", "表示価格にあとから税が加算される"],
                                ["perItem", "商品によって異なる"],
                                ["unknown", "分からない"],
                              ].map(([value, label]) => (
                                <FormControlLabel
                                  key={value}
                                  value={value}
                                  control={<Radio disabled={busy} />}
                                  label={label}
                                />
                              ))}
                            </RadioGroup>
                          </FormControl>
                          <FormControl>
                            <FormLabel>2. 税率はどれですか</FormLabel>
                            <RadioGroup
                              aria-label="2. 税率はどれですか"
                              value={form.taxRateComposition ?? ""}
                              onChange={(event) =>
                                setChoice("taxRateComposition", event.target.value)
                              }
                            >
                              {[
                                ["rate8", "すべて8%"],
                                ["rate10", "すべて10%"],
                                ["mixed", "8%と10%が混ざっている"],
                                ["unknown", "分からない"],
                              ].map(([value, label]) => (
                                <FormControlLabel
                                  key={value}
                                  value={value}
                                  control={<Radio disabled={busy} />}
                                  label={label}
                                />
                              ))}
                            </RadioGroup>
                          </FormControl>
                        </Stack>
                      </Box>
                    )}
                    {canEditTax && (
                      <Box
                        component="section"
                        ref={register("tax-summary")}
                        tabIndex={-1}
                        aria-label="税内訳を確認"
                      >
                        <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
                          税内訳を確認
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 1 }}>
                          税額が未確定の場合は、対象額が税込か税抜かをレシートと照合してください。8%と10%が混ざっている場合、上の全体設定だけでは税内訳は確定しません。割引も対象税率に含めて確認してください。
                        </Typography>
                        <ReceiptTaxSummary
                          draft={draft}
                          onSummaryChange={busy ? undefined : props.onTaxSummaryChange}
                          updatingIndex={props.taxSummaryUpdatingIndex}
                        />
                      </Box>
                    )}
                    <Box
                      component="section"
                      ref={register("items")}
                      tabIndex={-1}
                      aria-label="商品と割引"
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
                          商品と割引（{items.length}明細）
                        </Typography>
                        <Button disabled={busy} type="button" onClick={props.onAddItem}>
                          明細を追加
                        </Button>
                      </Stack>
                      {guidance
                        .filter((issue) => issue.target === "items")
                        .map((issue) => (
                          <Alert
                            key={issue.id}
                            severity={issue.required ? "error" : "info"}
                            sx={{ mb: 1.5 }}
                          >
                            <Typography variant="subtitle2">
                              {issue.scope === "receipt"
                                ? "レシート全体の確認"
                                : issue.required
                                  ? "修正必須"
                                  : "確認推奨"}
                            </Typography>
                            {issue.message}
                          </Alert>
                        ))}
                      {totalOnly && (
                        <Alert severity="info" sx={{ mb: 1 }}>
                          合計だけ保存するため、商品明細は参考として残します。商品別のカテゴリ集計には使いません。
                        </Alert>
                      )}
                      {products.length > 1 && (
                        <Button
                          disabled={busy}
                          type="button"
                          onClick={() => props.onCategorySplitChange(!props.isCategorySplit)}
                          sx={{ mb: 1 }}
                        >
                          {props.isCategorySplit ? "単一カテゴリに戻す" : "カテゴリを分ける"}
                        </Button>
                      )}
                      {!items.length && (
                        <Typography variant="body2">
                          明細はありません。レシートの合計とカテゴリを確認してください。
                        </Typography>
                      )}
                      <Stack spacing={1.5}>
                        {items.map((item, index) => {
                          const itemIssues = guidance.filter((issue) => issue.target === item.id);
                          const isOpen = expanded[item.id] ?? itemIssues.length > 0;
                          const context = buildTaxContextFromReviewItem(item);
                          const target = products.find(
                            (product) => product.id === item.discountTargetItemId,
                          );
                          return (
                            <Box
                              component="details"
                              key={item.id}
                              ref={register(item.id)}
                              tabIndex={-1}
                              open={isOpen}
                              sx={{
                                border: "1px solid",
                                borderColor: itemIssues.some((issue) => issue.required)
                                  ? "error.main"
                                  : itemIssues.length
                                    ? "warning.main"
                                    : "divider",
                                borderRadius: 1.5,
                                p: 1.5,
                                scrollMarginTop: 16,
                              }}
                            >
                              <Box
                                component="summary"
                                onClick={(event) => {
                                  event.preventDefault();
                                  setExpanded((current) => ({ ...current, [item.id]: !isOpen }));
                                }}
                                sx={{ cursor: "pointer" }}
                              >
                                <Typography component="span" sx={{ fontWeight: 700 }}>
                                  {item.itemName || `明細 ${index + 1}`}　
                                  {item.amountYen || "未入力"}円
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {categoryNames.get(item.categoryId) ?? "カテゴリ未設定"} ・{" "}
                                  {context.status === "resolved"
                                    ? `${context.taxRatePercent}% / ${context.amountBasis === "tax_included" ? "税込" : "税抜"}`
                                    : "税情報は未確定"}
                                  {target ? ` ・ 割引対象：${target.itemName}` : ""}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  color={
                                    itemIssues.some((issue) => issue.required)
                                      ? "error.main"
                                      : "text.secondary"
                                  }
                                >
                                  {itemIssues.length
                                    ? `${itemIssues.some((issue) => issue.required) ? "修正必須" : "確認推奨"} ・ `
                                    : ""}
                                  {isOpen ? "閉じる" : "確認・修正する"}
                                </Typography>
                              </Box>
                              <Stack
                                spacing={1}
                                sx={{ pt: 1.5 }}
                                onFocusCapture={() =>
                                  setExpanded((current) =>
                                    current[item.id] === true
                                      ? current
                                      : { ...current, [item.id]: true },
                                  )
                                }
                              >
                                {itemIssues.map((issue) => (
                                  <Alert
                                    key={issue.id}
                                    severity={issue.required ? "error" : "info"}
                                  >
                                    {issue.message}
                                  </Alert>
                                ))}
                                <ReviewItemCard
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
                                  enableItemTaxEditing={canEditTax && !!item.persistedItemId}
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
                                {!canEditTax && context.status === "unresolved" && (
                                  <Typography variant="body2" color="text.secondary">
                                    税内訳を読み取れていません。上の「レシート全体の税込・税率設定」で確認するか、合計だけ保存できます。
                                  </Typography>
                                )}
                              </Stack>
                            </Box>
                          );
                        })}
                      </Stack>
                    </Box>
                    <Box
                      component="section"
                      ref={register("save")}
                      tabIndex={-1}
                      aria-label="保存内容"
                      sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1.5 }}
                    >
                      <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
                        保存内容を確認
                      </Typography>
                      <Typography>
                        支払額：
                        {form.amountYen ? `${Number(form.amountYen).toLocaleString()}円` : "未入力"}
                      </Typography>
                      {items.length > 0 && (
                        <>
                          <Typography>
                            印字額の合計：
                            {summary.printedTotal === undefined
                              ? "未確定"
                              : `${summary.printedTotal.toLocaleString()}円`}
                          </Typography>
                          <Typography>
                            商品合計：
                            {summary.itemTotal === undefined
                              ? "未確定"
                              : `${summary.itemTotal.toLocaleString()}円`}
                          </Typography>
                          <Typography>
                            差額：
                            {summary.difference === undefined
                              ? "未確定"
                              : summary.difference === 0
                                ? "0円（金額一致）"
                                : `${Math.abs(summary.difference).toLocaleString()}円`}
                          </Typography>
                          <Typography>
                            商品の税額：
                            {summary.taxYen === undefined
                              ? "未確定"
                              : `${summary.taxYen.toLocaleString()}円`}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            金額の一致と、税情報の確定は別に確認しています。
                          </Typography>
                        </>
                      )}
                      <FormControl sx={{ mt: 2 }}>
                        <FormLabel>保存方法</FormLabel>
                        <RadioGroup
                          aria-label="保存方法"
                          value={effectiveReviewMode(form)}
                          onChange={(event) =>
                            onFieldChange("registrationMode", event.target.value)
                          }
                        >
                          <FormControlLabel
                            value="detailed"
                            disabled={unknownChoice || busy}
                            control={<Radio />}
                            label="明細ごとに保存"
                          />
                          <FormControlLabel
                            value="totalOnly"
                            disabled={busy}
                            control={<Radio />}
                            label="レシート合計だけ保存"
                          />
                        </RadioGroup>
                      </FormControl>
                      {totalOnly && (
                        <Alert severity="info">
                          税を推測せず、レシート合計だけで保存します。商品明細は確認用に残りますが、履歴・予算・カテゴリ集計には使われません。
                        </Alert>
                      )}
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        まず下書きとして保存します。確認事項が残る場合は、保存後も確認待ちに残ります。
                      </Typography>
                    </Box>
                  </Stack>
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
        recommendationCount={recommendations.length}
        receiptReviewRecommended={receiptGuidance.length > 0}
        totalOnly={totalOnly}
        onClose={props.onClose}
        onSubmit={save}
        onReviewRequired={() => goTo(required[0]?.target ?? "basics")}
      />
    </Dialog>
  );
}

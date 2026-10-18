import type {
  ReceiptLineClassification,
  ReceiptLineClassificationCandidate,
  ReceiptStructuralLineRole,
  ReceiptRawObservationLine,
} from "./observations";

type ClassificationContext = {
  receiptTotalYen?: number | null;
  taxAmountsYen?: number[];
};

type MutableCandidate = { score: number; evidence: Set<string> };

const ROLE_ORDER: ReceiptStructuralLineRole[] = [
  "change",
  "cashReceived",
  "paymentMethodAmount",
  "subtotal",
  "tax",
  "totalCandidate",
  "coupon",
  "pointsUsed",
  "receiptDiscount",
  "itemDiscount",
  "fee",
  "item",
  "unknown",
];

const LEGACY_ROLE_MAP: Record<string, ReceiptStructuralLineRole[]> = {
  item: ["item"],
  discount: ["itemDiscount", "receiptDiscount"],
  tax: ["tax"],
  subtotal: ["subtotal"],
  total: ["totalCandidate"],
  payment: ["paymentMethodAmount", "cashReceived"],
  change: ["change"],
  unknown: ["unknown"],
};

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\s,:：・￥¥円]/g, "")
    .toLowerCase();
}

function addCandidate(
  candidates: Map<ReceiptStructuralLineRole, MutableCandidate>,
  role: ReceiptStructuralLineRole,
  score: number,
  evidence: string,
) {
  const current = candidates.get(role) ?? { score: 0, evidence: new Set<string>() };
  current.score = Math.min(1, Math.max(current.score, score));
  current.evidence.add(evidence);
  candidates.set(role, current);
}

function hasAmount(line: ReceiptRawObservationLine) {
  return line.amountYen !== null;
}

export function isReceiptCountLabel(rawText: string): boolean {
  const text = normalizeText(rawText);
  if (/[¥￥円]/.test(rawText.normalize("NFKC"))) return false;
  return (
    /^(?:(?:お|ご)?買上|購入|商品|合計|総計)*(?:点数|品数|数量|個数|件数)(?:合計|計)?(?:\d+(?:点|品|個|件)?)?$/.test(
      text,
    ) ||
    /^(?:合計|総計|お買上)\d+(?:点|品|個|件)$/.test(text) ||
    /^(?:total(?:items?|quantity|count)|(?:item|quantity|count)total)\d*$/.test(text) ||
    /^(?:合計ポイント|ポイント合計|totalpoints|pointstotal)\d*(?:pt|p|ポイント)?$/.test(text)
  );
}

/**
 * 「今回お買上げポイント 9P」や「今月購入金額合計」のように、合計の語を含むが今回の支払額ではない行。
 * 通貨記号の有無では判定しない。「ポイント利用後合計 2,408」は記号が無くても支払合計で、
 * 「付与ポイント 9P（9円相当）」は円を含んでも支払合計ではないため。
 */
function isNonPaymentTotalLabel(rawText: string): boolean {
  const text = normalizeText(rawText);
  const pointAmount = /\d(?:pt|p|ポイント)(?:$|\()/i.test(text);
  const earnedOrBalance =
    /(?:付与|獲得|加算|進呈|残高|保有)/.test(text) && !/(?:お支払|ご請求|今回支払額)/.test(text);
  return (
    (/(?:ポイント|point)/i.test(text) && (pointAmount || earnedOrBalance)) ||
    /(?:今月|当月|先月|前月|累計|年間|本年|今年|前回まで|これまで)/.test(text)
  );
}

/** 構造分類と税内訳の照合で共通の支払合計ラベルを使う。 */
export function isReceiptTotalLabel(rawText: string): boolean {
  const text = normalizeText(rawText);
  return (
    /(?:合計|総計|お買上|ご請求額|お支払(?:額|合計)|今回支払額|total)/i.test(text) &&
    !isReceiptCountLabel(rawText) &&
    !isNonPaymentTotalLabel(rawText) &&
    !/(?:小計|値引|割引|subtotal)/i.test(text)
  );
}

function addLabelCandidates(
  line: ReceiptRawObservationLine,
  candidates: Map<ReceiptStructuralLineRole, MutableCandidate>,
) {
  const text = normalizeText(line.rawText);

  if (/(?:お?釣り?|つり銭|釣銭|change)/i.test(text)) {
    addCandidate(candidates, "change", 0.98, "explicit_label:change");
  }
  if (/(?:お預り|お預かり|預り|預かり|受取現金)/.test(text)) {
    addCandidate(candidates, "cashReceived", 0.98, "explicit_label:cash_received");
  }
  if (
    /(?:クレジット|visa|master|jcb|amex|paypay|楽天pay|電子マネー|交通系|支払方法|決済額|カード)/i.test(
      text,
    )
  ) {
    addCandidate(candidates, "paymentMethodAmount", 0.94, "explicit_label:payment_method");
  } else if (/^(?:現金|cash)(?:支払|払い)?(?:\d|[-+*])*/i.test(text)) {
    addCandidate(candidates, "paymentMethodAmount", 0.88, "explicit_label:cash_payment");
  }
  if (/(?:小計|税抜小計|課税小計|商品計)/.test(text)) {
    addCandidate(candidates, "subtotal", 0.97, "explicit_label:subtotal");
  }
  if (
    /(?:消費[税説悦稅]|内[税説悦稅]|外[税説悦稅]|税額|税合計|税計|tax)(?:額|計|対象|タイショウ|\d|[%％]|$)/i.test(
      text,
    )
  ) {
    addCandidate(candidates, "tax", 0.94, "explicit_or_partial_label:tax");
  } else if (/(?:\d+[%％](?:課税)?対象(?:額)?|課税対象(?:額)?|税率別対象(?:額)?)/.test(text)) {
    addCandidate(candidates, "tax", 0.88, "structural_label:taxable_amount");
  } else if (
    /(?:[0-9０-９]+[%％].*(?:内|外)[税説悦稅]|(?:内|外)[税説悦稅].*[0-9０-９]+[%％])/.test(
      line.rawText,
    )
  ) {
    addCandidate(candidates, "tax", 0.8, "partial_label:tax");
  }
  if (isReceiptTotalLabel(line.rawText)) {
    addCandidate(candidates, "totalCandidate", 0.94, "explicit_label:total");
  }
  if (/(?:クーポン|coupon)/i.test(text)) {
    addCandidate(candidates, "coupon", 0.97, "explicit_label:coupon");
  }
  if (/(?:ポイント(?:利用|使用|充当)|ポイント値引)/.test(text)) {
    addCandidate(candidates, "pointsUsed", 0.97, "explicit_label:points_used");
  }
  if (/(?:レシート|合計|小計|会員).*(?:値引|割引)|(?:値引|割引).*(?:合計|小計)/.test(text)) {
    addCandidate(candidates, "receiptDiscount", 0.92, "explicit_label:receipt_discount");
  } else if (/(?:値引|割引|○引|引き)/.test(text)) {
    addCandidate(candidates, "itemDiscount", 0.84, "explicit_label:item_discount");
  }
  if (/(?:袋代|レジ袋|手数料|配送料|送料|fee)/i.test(text)) {
    addCandidate(candidates, "fee", 0.96, "explicit_label:fee");
  }
}

function addAiCandidates(
  line: ReceiptRawObservationLine,
  candidates: Map<ReceiptStructuralLineRole, MutableCandidate>,
) {
  for (const rawRole of line.lineRoleCandidates as string[]) {
    const roles = LEGACY_ROLE_MAP[rawRole] ?? ([rawRole] as ReceiptStructuralLineRole[]);
    for (const role of roles) {
      const score = role === "unknown" ? 0.4 : 0.35 + line.roleConfidence * 0.4;
      addCandidate(candidates, role, score, `ai_candidate:${rawRole}`);
    }
  }
}

function addContextEvidence(
  line: ReceiptRawObservationLine,
  index: number,
  lineCount: number,
  context: ClassificationContext,
  candidates: Map<ReceiptStructuralLineRole, MutableCandidate>,
) {
  const position = line.boundingBox?.top ?? (lineCount <= 1 ? 0.5 : index / (lineCount - 1));
  if (position >= 0.6) {
    for (const role of [
      "subtotal",
      "tax",
      "totalCandidate",
      "paymentMethodAmount",
      "cashReceived",
      "change",
    ] as const) {
      const candidate = candidates.get(role);
      if (candidate) {
        candidate.score = Math.min(1, candidate.score + 0.04);
        candidate.evidence.add("position:receipt_footer");
      }
    }
  }

  if (line.amountYen !== null && context.taxAmountsYen?.includes(line.amountYen)) {
    const tax = candidates.get("tax");
    if (tax) {
      tax.score = Math.min(1, tax.score + 0.04);
      tax.evidence.add("amount_relation:tax_summary");
    } else if (position >= 0.6) {
      addCandidate(
        candidates,
        "unknown",
        0.7,
        "structural_context:footer_tax_amount_without_label",
      );
    }
  }
  if (line.amountYen !== null && line.amountYen === context.receiptTotalYen) {
    const total = candidates.get("totalCandidate");
    if (total) {
      total.score = Math.min(1, total.score + 0.04);
      total.evidence.add("amount_relation:receipt_total");
    }
  }
}

function finalizeCandidates(
  line: ReceiptRawObservationLine,
  candidates: Map<ReceiptStructuralLineRole, MutableCandidate>,
): ReceiptLineClassification {
  if (candidates.size === 0 || (!hasAmount(line) && normalizeText(line.rawText).length === 0)) {
    addCandidate(candidates, "unknown", 1, "no_classification_evidence");
  }

  const sorted: ReceiptLineClassificationCandidate[] = [...candidates.entries()]
    .map(([role, value]) => ({
      role,
      score: Number(value.score.toFixed(2)),
      evidence: [...value.evidence],
    }))
    .sort(
      (left, right) =>
        right.score - left.score || ROLE_ORDER.indexOf(left.role) - ROLE_ORDER.indexOf(right.role),
    );

  const first = sorted[0];
  const second = sorted[1];
  const ambiguous =
    first.role === "unknown" ||
    first.score < 0.65 ||
    (first.score < 0.8 && second !== undefined && first.score - second.score < 0.15);
  if (ambiguous && !sorted.some((candidate) => candidate.role === "unknown")) {
    sorted.push({ role: "unknown", score: 0.4, evidence: ["classification_ambiguous"] });
  }

  return {
    sourceLineIndex: line.sourceLineIndex,
    status: ambiguous ? "ambiguous" : "classified",
    candidates: sorted,
  };
}

function addAdjacentPaymentEvidence(
  lines: ReceiptRawObservationLine[],
  results: ReceiptLineClassification[],
) {
  for (let index = 1; index < lines.length; index += 1) {
    const previous = results[index - 1]?.candidates[0];
    const current = results[index];
    if (
      previous?.role !== "paymentMethodAmount" ||
      lines[index - 1]?.amountYen !== null ||
      lines[index]?.amountYen === null ||
      current === undefined
    ) {
      continue;
    }
    const existing = current.candidates.find(
      (candidate) => candidate.role === "paymentMethodAmount",
    );
    if (existing) {
      existing.score = Math.max(existing.score, 0.9);
      existing.evidence.push("surrounding_line:payment_method_label");
    } else {
      current.candidates.unshift({
        role: "paymentMethodAmount",
        score: 0.9,
        evidence: ["surrounding_line:payment_method_label"],
      });
    }
    current.candidates.sort((left, right) => right.score - left.score);
    current.status = "classified";
  }
}

function addPaymentChangeVerification(
  lines: ReceiptRawObservationLine[],
  results: ReceiptLineClassification[],
) {
  const amountFor = (role: ReceiptStructuralLineRole) =>
    results.flatMap((result, index) =>
      result.candidates[0]?.role === role && lines[index]?.amountYen !== null
        ? [{ result, amountYen: lines[index]!.amountYen! }]
        : [],
    );
  const payments = [...amountFor("cashReceived"), ...amountFor("paymentMethodAmount")];
  const changes = amountFor("change");
  const totals = amountFor("totalCandidate");

  for (const total of totals) {
    if (
      payments.some((payment) =>
        changes.some((change) => payment.amountYen - change.amountYen === total.amountYen),
      )
    ) {
      const candidate = total.result.candidates.find((entry) => entry.role === "totalCandidate");
      if (candidate) {
        candidate.score = Number(Math.min(1, candidate.score + 0.03).toFixed(2));
        candidate.evidence.push("amount_relation:payment_minus_change");
      }
    }
  }
}

function resolveCompetingTotalCandidates(
  lines: ReceiptRawObservationLine[],
  results: ReceiptLineClassification[],
) {
  const groups = new Map<number, Array<{ index: number; position: number; specificity: number }>>();
  results.forEach((result, index) => {
    if (result.candidates[0]?.role !== "totalCandidate") return;
    const line = lines[index];
    if (!line || line.amountYen === null) return;
    const text = normalizeText(line.rawText);
    const specificity = /(?:お支払合計|ご請求額|今回支払額|総計)/.test(text) ? 2 : 1;
    const position =
      line.boundingBox?.top ?? (lines.length <= 1 ? 0.5 : index / (lines.length - 1));
    const group = groups.get(line.amountYen) ?? [];
    group.push({ index, position, specificity });
    groups.set(line.amountYen, group);
  });

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort(
      (left, right) => right.specificity - left.specificity || right.position - left.position,
    );
    const best = group[0]!;
    const runnerUp = group[1]!;
    const hasClearWinner =
      best.specificity > runnerUp.specificity || best.position - runnerUp.position >= 0.05;

    group.forEach((entry, rank) => {
      const result = results[entry.index]!;
      const candidate = result.candidates.find((value) => value.role === "totalCandidate")!;
      candidate.evidence.push(`cross_line_rank:${rank + 1}`);
      if (rank > 0) {
        candidate.score = Number(
          Math.min(candidate.score, Math.max(0, 0.94 - rank * 0.04)).toFixed(2),
        );
        result.status = "ambiguous";
        if (!result.candidates.some((value) => value.role === "unknown")) {
          result.candidates.push({
            role: "unknown",
            score: 0.4,
            evidence: ["competing_total_candidate"],
          });
        }
      } else if (!hasClearWinner) {
        result.status = "ambiguous";
        if (!result.candidates.some((value) => value.role === "unknown")) {
          result.candidates.push({
            role: "unknown",
            score: 0.4,
            evidence: ["competing_total_candidate"],
          });
        }
      }
    });
  }
}

export function classifyReceiptLines(
  lines: ReceiptRawObservationLine[],
  context: ClassificationContext = {},
): ReceiptLineClassification[] {
  const ordered = [...lines].sort((left, right) => left.sourceLineIndex - right.sourceLineIndex);
  const results = ordered.map((line, index) => {
    const candidates = new Map<ReceiptStructuralLineRole, MutableCandidate>();
    addLabelCandidates(line, candidates);
    addAiCandidates(line, candidates);
    addContextEvidence(line, index, ordered.length, context, candidates);
    return finalizeCandidates(line, candidates);
  });
  addAdjacentPaymentEvidence(ordered, results);
  addPaymentChangeVerification(ordered, results);
  resolveCompetingTotalCandidates(ordered, results);
  return results;
}

export function normalizeReceiptLineMatchText(value: string): string {
  return normalizeText(value).replace(/[+\-*()（）\d]/g, "");
}

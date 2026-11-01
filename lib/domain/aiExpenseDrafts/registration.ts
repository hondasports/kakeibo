import type {
  AiExpenseRegistrationMode,
  DerivedRegistrationSnapshot,
  RegistrationDestination,
} from "./receiptDataContract";

export type ReadyDraftForRegistration = {
  status: string;
  date?: string;
  amountYen?: number;
  categoryId?: string | null;
};

export type ValidateReadyDraftError =
  | "not_ready"
  | "missing_date"
  | "missing_amount"
  | "missing_category";

export function validateReadyDraftForRegistration(
  draft: ReadyDraftForRegistration,
): { success: true } | { success: false; error: ValidateReadyDraftError } {
  if (draft.status !== "ready") {
    return { success: false, error: "not_ready" };
  }
  if (!draft.date) {
    return { success: false, error: "missing_date" };
  }
  if (draft.amountYen === undefined || draft.amountYen <= 0) {
    return { success: false, error: "missing_amount" };
  }
  if (!draft.categoryId) {
    return { success: false, error: "missing_category" };
  }
  return { success: true };
}

export function dedupeDraftIds<T extends string>(draftIds: T[]): T[] {
  return [...new Set(draftIds)];
}

export type RegisteredDraftCheck = {
  status: string;
  registeredReceiptId?: string;
};

export function isAlreadyRegisteredAsReceipt(draft: RegisteredDraftCheck): boolean {
  return draft.status === "registered" && !!draft.registeredReceiptId;
}

export function isAlreadyRegistered(draft: { status: string }): boolean {
  return draft.status === "registered";
}

const readyDraftRegistrationErrorMessages: Record<ValidateReadyDraftError, string> = {
  not_ready: "Only ready drafts can be registered",
  missing_date: "Draft date is required to register",
  missing_amount: "Draft amount is required to register",
  missing_category: "Draft category is required to register",
};

/** ready 状態の下書きを登録できない理由をメッセージに変換する */
export function getReadyDraftRegistrationErrorMessage(error: ValidateReadyDraftError): string {
  return readyDraftRegistrationErrorMessages[error];
}

/**
 * registered 遷移時に保存する derivedRegistration スナップショットを構築する。
 * totalOnly の場合は税内訳を持たないことを null で明示する。
 */
export function buildDerivedRegistration(args: {
  destination: RegistrationDestination;
  registrationMode: AiExpenseRegistrationMode;
  amountYen: number;
  date: string;
  categoryIds: string[];
  registeredAt: number;
}): DerivedRegistrationSnapshot {
  return {
    source: "derived",
    destination: args.destination,
    registrationMode: args.registrationMode,
    ...(args.registrationMode === "totalOnly"
      ? { taxRatePercent: null, taxableAmountYen: null, taxYen: null }
      : {}),
    amountYen: args.amountYen,
    date: args.date,
    categoryIds: args.categoryIds,
    registeredAt: args.registeredAt,
  };
}

/**
 * 既存の登録日時を解決する。derivedRegistration を持たない旧データは
 * backfill 済みのトップレベル値を使う。編集のたびに現在時刻へ書き換えると
 * 一覧の先頭へ不正に移動するため、now はどちらも無い場合だけの最後の手段。
 */
export function resolveRegisteredAt(
  draft: {
    derivedRegistration?: { registeredAt: number } | null;
    registeredAt?: number;
  },
  now: number,
): number {
  return draft.derivedRegistration?.registeredAt ?? draft.registeredAt ?? now;
}

/**
 * registered 遷移時の patch に展開する登録フィールドを構築する。
 * トップレベルの registeredAt は一覧 index 用の写しで、derivedRegistration.registeredAt と
 * 同じ値にしないと一覧の末尾に沈むため、ここでしか作らない。
 */
export function buildRegistrationPatchFields(args: {
  destination: RegistrationDestination;
  registrationMode: AiExpenseRegistrationMode;
  amountYen: number;
  date: string;
  categoryIds: string[];
  registeredAt: number;
}): {
  registeredAt: number;
  derivedRegistration: ReturnType<typeof buildDerivedRegistration>;
} {
  const derivedRegistration = buildDerivedRegistration(args);
  return { registeredAt: derivedRegistration.registeredAt, derivedRegistration };
}

import type { GroupInvitationPreview } from "../../../../lib/domain/groups/groupInvitation";

/**
 * 招待受諾ページの表示エラーメッセージ。
 * どの遷移でどの文言になるかを遷移関数と一か所で追跡できるようにここで定義する。
 */
export const GROUP_INVITATION_ACCEPT_ERRORS = {
  previewFailed:
    "招待内容を確認できませんでした。招待先のアカウントとリンクの有効性を確認してください。",
  acceptFailed: "招待を処理できませんでした。招待内容を再確認して、もう一度操作してください。",
  clerkTicketFailed:
    "招待リンクの認証を完了できませんでした。リンクを開き直して再度お試しください。",
  accountSwitchFailed:
    "招待リンクの認証を開始できませんでした。リンクを開き直して再度お試しください。",
  unsupportedRequirements:
    "招待の認証に追加の設定が必要です。Clerkのサインアップ必須項目を確認してください。",
  profileFinalizeFailed:
    "招待の認証に必要な情報を完了できませんでした。入力内容を確認してください。",
  profileUpdateFailed: "招待の認証に必要な情報を保存できませんでした。入力内容を確認してください。",
} as const;

export type GroupInvitationPreviewResult = {
  token: string;
  details: GroupInvitationPreview;
};

/** Clerk の不足項目に対する対応方針。副作用関数が判定し、遷移が UI 状態へ反映する。 */
export type ClerkRequirementResolution = "profileForm" | "ssoRedirect" | "unsupported";

/**
 * 相互依存する UI 状態。
 * firstName / lastName の入力値や、同じ render 内の連続イベントを防ぐ ref は
 * 遷移と独立しているため呼び出し側の hook が保持する。
 */
export type GroupInvitationAcceptState = {
  /** token に紐づく preview 結果。受諾失敗時は破棄して再取得し直す。 */
  preview: GroupInvitationPreviewResult | null;
  /** 表示グループ切替への同意。受諾失敗・context 変化で必ず取り直す。 */
  switchActiveGroup: boolean;
  error: string;
  /** Clerk が要求した不足項目。必須表示と update payload の決定に使う。 */
  missingProfileFields: string[];
  needsProfileDetails: boolean;
  /** いずれかの非同期処理が進行中。操作可否の導出に使う。 */
  isCompletingInvitation: boolean;
};

export const initialGroupInvitationAcceptState: GroupInvitationAcceptState = {
  preview: null,
  switchActiveGroup: false,
  error: "",
  missingProfileFields: [],
  needsProfileDetails: false,
  isCompletingInvitation: false,
};

/** Clerk 認証フェーズと招待確認・受諾フェーズの両方から届く出来事。 */
export type GroupInvitationAcceptEvent =
  | { type: "invitationContextReset" }
  | { type: "previewLoaded"; preview: GroupInvitationPreviewResult }
  | { type: "previewFailed" }
  | { type: "switchConsentChanged"; checked: boolean }
  | { type: "acceptStarted" }
  | { type: "acceptFailed" }
  | { type: "clerkTicketStarted" }
  | {
      type: "clerkRequirementsDetected";
      missingFields: string[];
      resolution: ClerkRequirementResolution;
    }
  | { type: "clerkTicketFailed" }
  | { type: "accountSwitchStarted" }
  | { type: "accountSwitchFailed" }
  | { type: "profileDetailsStarted" }
  | { type: "profileDetailsFinalizeFailed" }
  | { type: "profileDetailsFailed" }
  | { type: "processingFinished" };

export function groupInvitationAcceptReducer(
  state: GroupInvitationAcceptState,
  event: GroupInvitationAcceptEvent,
): GroupInvitationAcceptState {
  switch (event.type) {
    case "invitationContextReset":
      return { ...state, preview: null, switchActiveGroup: false, error: "" };
    case "previewLoaded":
      return { ...state, preview: event.preview };
    case "previewFailed":
      return { ...state, error: GROUP_INVITATION_ACCEPT_ERRORS.previewFailed };
    case "switchConsentChanged":
      return { ...state, switchActiveGroup: event.checked };
    case "acceptStarted":
      return { ...state, isCompletingInvitation: true, error: "" };
    // 受諾失敗: 確認内容と同意は信頼できないため両方破棄し、preview の再取得へ進む。
    case "acceptFailed":
      return {
        ...state,
        preview: null,
        switchActiveGroup: false,
        error: GROUP_INVITATION_ACCEPT_ERRORS.acceptFailed,
      };
    // Clerk ticket 消費の開始。contextReset 済みの error をここでは消さない。
    case "clerkTicketStarted":
      return { ...state, isCompletingInvitation: true };
    case "clerkRequirementsDetected": {
      const withFields: GroupInvitationAcceptState = {
        ...state,
        missingProfileFields: event.missingFields,
      };
      if (event.resolution === "profileForm") {
        return { ...withFields, needsProfileDetails: true };
      }
      if (event.resolution === "unsupported") {
        return { ...withFields, error: GROUP_INVITATION_ACCEPT_ERRORS.unsupportedRequirements };
      }
      return withFields;
    }
    case "clerkTicketFailed":
      return { ...state, error: GROUP_INVITATION_ACCEPT_ERRORS.clerkTicketFailed };
    case "accountSwitchStarted":
      return { ...state, error: "", isCompletingInvitation: true };
    case "accountSwitchFailed":
      return { ...state, error: GROUP_INVITATION_ACCEPT_ERRORS.accountSwitchFailed };
    case "profileDetailsStarted":
      return { ...state, error: "", isCompletingInvitation: true };
    case "profileDetailsFinalizeFailed":
      return { ...state, error: GROUP_INVITATION_ACCEPT_ERRORS.profileFinalizeFailed };
    case "profileDetailsFailed":
      return { ...state, error: GROUP_INVITATION_ACCEPT_ERRORS.profileUpdateFailed };
    case "processingFinished":
      return { ...state, isCompletingInvitation: false };
  }
}

export type InvitationPageContext = {
  isClerkLoaded: boolean;
  isSignedIn: boolean | undefined;
  isAuthenticated: boolean;
  token: string | null;
  clerkTicket: string | null;
};

/** 表示中の招待内容。認証済み・ticket 消費前・token 一致の preview だけを公開する。 */
export function selectInvitation(
  state: GroupInvitationAcceptState,
  context: Pick<InvitationPageContext, "isAuthenticated" | "token" | "clerkTicket">,
): GroupInvitationPreview | null {
  return context.isAuthenticated && !context.clerkTicket && state.preview?.token === context.token
    ? state.preview.details
    : null;
}

export function selectNeedsGroupSwitch(invitation: GroupInvitationPreview | null): boolean {
  return Boolean(invitation?.activeGroupId && invitation.activeGroupId !== invitation.groupId);
}

/** 既存セッションのまま招待 ticket URL を開いた状態。明示操作まで signOut しない。 */
export function selectNeedsAccountSwitch(
  context: Pick<InvitationPageContext, "isClerkLoaded" | "isSignedIn" | "token" | "clerkTicket">,
): boolean {
  return Boolean(
    context.isClerkLoaded && context.isSignedIn && context.token && context.clerkTicket,
  );
}

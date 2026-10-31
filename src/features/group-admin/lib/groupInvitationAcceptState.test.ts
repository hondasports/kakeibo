import { describe, expect, it } from "vitest";
import {
  groupInvitationAcceptReducer,
  initialGroupInvitationAcceptState,
  selectInvitation,
  selectNeedsAccountSwitch,
  selectNeedsGroupSwitch,
  type GroupInvitationAcceptState,
} from "./groupInvitationAcceptState";

const preview = {
  token: "invite-token",
  details: {
    groupId: "group-001",
    groupName: "招待先の家計",
    activeGroupId: "group-current",
    activeGroupName: "現在の家計",
    isExistingMember: false,
  },
};

const confirmedState: GroupInvitationAcceptState = {
  ...initialGroupInvitationAcceptState,
  preview,
  switchActiveGroup: true,
};

describe("groupInvitationAcceptState", () => {
  it("context 変化では確認内容・同意・エラーを破棄し、プロフィール入力要求は維持する", () => {
    const state = groupInvitationAcceptReducer(
      {
        ...confirmedState,
        error: "何らかのエラー",
        missingProfileFields: ["first_name"],
        needsProfileDetails: true,
      },
      { type: "invitationContextReset" },
    );

    expect(state.preview).toBeNull();
    expect(state.switchActiveGroup).toBe(false);
    expect(state.error).toBe("");
    expect(state.missingProfileFields).toEqual(["first_name"]);
    expect(state.needsProfileDetails).toBe(true);
  });

  it("preview は認証済みかつ token 一致のときだけ表示へ公開する", () => {
    const state = groupInvitationAcceptReducer(confirmedState, {
      type: "previewLoaded",
      preview,
    });

    expect(
      selectInvitation(state, {
        isAuthenticated: true,
        clerkTicket: null,
        token: "invite-token",
      }),
    ).toEqual(preview.details);
    expect(
      selectInvitation(state, {
        isAuthenticated: true,
        clerkTicket: null,
        token: "other-token",
      }),
    ).toBeNull();
    expect(
      selectInvitation(state, {
        isAuthenticated: true,
        clerkTicket: "ticket-001",
        token: "invite-token",
      }),
    ).toBeNull();
    expect(
      selectInvitation(state, {
        isAuthenticated: false,
        clerkTicket: null,
        token: "invite-token",
      }),
    ).toBeNull();
  });

  it("受諾失敗では preview・同意を破棄してエラーを表示し、再取得完了まで処理中を維持する", () => {
    const processing = groupInvitationAcceptReducer(confirmedState, {
      type: "acceptStarted",
    });
    const failed = groupInvitationAcceptReducer(processing, { type: "acceptFailed" });

    expect(failed.preview).toBeNull();
    expect(failed.switchActiveGroup).toBe(false);
    expect(failed.error).toBe(
      "招待を処理できませんでした。招待内容を再確認して、もう一度操作してください。",
    );
    expect(failed.isCompletingInvitation).toBe(true);

    const settled = groupInvitationAcceptReducer(failed, { type: "processingFinished" });
    expect(settled.isCompletingInvitation).toBe(false);
  });

  it("受諾失敗後の preview 再取得に失敗すると確認エラーへ上書きする", () => {
    const failed = groupInvitationAcceptReducer(confirmedState, { type: "acceptFailed" });
    const state = groupInvitationAcceptReducer(failed, { type: "previewFailed" });

    expect(state.error).toBe(
      "招待内容を確認できませんでした。招待先のアカウントとリンクの有効性を確認してください。",
    );
  });

  it("Clerk の不足項目は ssoRedirect では名前フォームを出さず、unsupported ではエラーを表示する", () => {
    const sso = groupInvitationAcceptReducer(initialGroupInvitationAcceptState, {
      type: "clerkRequirementsDetected",
      missingFields: ["password"],
      resolution: "ssoRedirect",
    });
    expect(sso.missingProfileFields).toEqual(["password"]);
    expect(sso.needsProfileDetails).toBe(false);
    expect(sso.error).toBe("");

    const unsupported = groupInvitationAcceptReducer(initialGroupInvitationAcceptState, {
      type: "clerkRequirementsDetected",
      missingFields: ["username"],
      resolution: "unsupported",
    });
    expect(unsupported.needsProfileDetails).toBe(false);
    expect(unsupported.error).toBe(
      "招待の認証に追加の設定が必要です。Clerkのサインアップ必須項目を確認してください。",
    );
  });

  it("Clerk ticket 消費の失敗は案内エラーを表示する", () => {
    const state = groupInvitationAcceptReducer(initialGroupInvitationAcceptState, {
      type: "clerkTicketFailed",
    });
    expect(state.error).toBe(
      "招待リンクの認証を完了できませんでした。リンクを開き直して再度お試しください。",
    );
  });

  it("プロフィール送信の失敗は finalize 失敗と update 失敗で文言を分ける", () => {
    const finalizeFailed = groupInvitationAcceptReducer(initialGroupInvitationAcceptState, {
      type: "profileDetailsFinalizeFailed",
    });
    expect(finalizeFailed.error).toBe(
      "招待の認証に必要な情報を完了できませんでした。入力内容を確認してください。",
    );

    const updateFailed = groupInvitationAcceptReducer(initialGroupInvitationAcceptState, {
      type: "profileDetailsFailed",
    });
    expect(updateFailed.error).toBe(
      "招待の認証に必要な情報を保存できませんでした。入力内容を確認してください。",
    );
  });

  it("グループ切替とアカウント切替の必要判定を導出する", () => {
    expect(selectNeedsGroupSwitch(preview.details)).toBe(true);
    expect(
      selectNeedsGroupSwitch({ ...preview.details, activeGroupId: preview.details.groupId }),
    ).toBe(false);
    expect(selectNeedsGroupSwitch({ ...preview.details, activeGroupId: null })).toBe(false);
    expect(selectNeedsGroupSwitch(null)).toBe(false);

    expect(
      selectNeedsAccountSwitch({
        isClerkLoaded: true,
        isSignedIn: true,
        token: "invite-token",
        clerkTicket: "ticket-001",
      }),
    ).toBe(true);
    expect(
      selectNeedsAccountSwitch({
        isClerkLoaded: true,
        isSignedIn: false,
        token: "invite-token",
        clerkTicket: "ticket-001",
      }),
    ).toBe(false);
    expect(
      selectNeedsAccountSwitch({
        isClerkLoaded: true,
        isSignedIn: true,
        token: "invite-token",
        clerkTicket: null,
      }),
    ).toBe(false);
  });
});

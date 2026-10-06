import { describe, it, expect, beforeAll } from "vitest";
import type { TransactionalEmailType } from "./model";
import {
  buildTransactionalEmail,
  validatePayloadForTemplate,
  getTemplateSubject,
} from "./templateFactory";

describe("templateFactory", () => {
  beforeAll(() => {
    process.env.APP_BASE_URL = "https://suzumemo.test";
  });

  it("builds email_delivery_test email", async () => {
    const built = await buildTransactionalEmail("email_delivery_test", {
      to: "user@example.com",
      groupName: "family",
    });
    expect(built.subject).toBe("Suzumemo メール配信テスト");
    expect(built.html).toContain("user@example.com");
    expect(built.text).toContain("user@example.com");
  });

  it("validates email_delivery_test payload", () => {
    const valid = validatePayloadForTemplate("email_delivery_test", { to: "user@example.com" });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data).toEqual({ to: "user@example.com" });
    }

    const invalid = validatePayloadForTemplate("email_delivery_test", { to: 123 });
    expect(invalid.success).toBe(false);
  });

  it("builds group_membership_removed email", async () => {
    const built = await buildTransactionalEmail("group_membership_removed", {
      groupName: " 山田 家 ",
    });
    expect(built.subject).toBe("「山田 家」から外れました | Suzumemo");
    expect(built.html).toContain("山田 家");
    expect(built.html).toContain("メンバーではなくなりました");
    expect(built.text).toContain("Suzumemoを開く");
    expect(built.text).toContain("https://suzumemo.test/");
    expect(built.text).toContain("Suzumemoの重要な状態変更");
  });

  it("builds group_role_changed email for member -> owner", async () => {
    const built = await buildTransactionalEmail("group_role_changed", {
      groupName: "山田家",
      previousRole: "member",
      newRole: "owner",
    });
    expect(built.subject).toBe("「山田家」での権限が変更されました | Suzumemo");
    expect(built.text).toContain("メンバーからオーナーへ変更されました");
    expect(built.text).toContain("グループ管理を行えるようになりました");
    expect(built.text).toContain("https://suzumemo.test/settings");
  });

  it("builds group_role_changed email for owner -> member", async () => {
    const built = await buildTransactionalEmail("group_role_changed", {
      groupName: "山田家",
      previousRole: "owner",
      newRole: "member",
    });
    expect(built.text).toContain("オーナーからメンバーへ変更されました");
    expect(built.text).toContain("グループへの所属と家計データの利用は継続できます");
  });

  it("rejects group_role_changed payload with same roles", () => {
    const result = validatePayloadForTemplate("group_role_changed", {
      groupName: "山田家",
      previousRole: "member",
      newRole: "member",
    });
    expect(result.success).toBe(false);
  });

  it("builds group_ownership_received email", async () => {
    const built = await buildTransactionalEmail("group_ownership_received", {
      groupName: "山田家",
    });
    expect(built.subject).toBe("「山田家」のオーナーになりました | Suzumemo");
    expect(built.text).toContain("オーナー権限を受け取りました");
    expect(built.text).toContain("https://suzumemo.test/settings");
  });

  it("builds group_ownership_transferred email", async () => {
    const built = await buildTransactionalEmail("group_ownership_transferred", {
      groupName: "山田家",
      newOwnerDisplayName: "花子",
    });
    expect(built.subject).toBe("「山田家」のオーナー権限を譲渡しました | Suzumemo");
    expect(built.text).toContain("花子さんへ譲渡しました");
    expect(built.text).toContain("あなたの権限はメンバーへ変更されています");
    expect(built.text).toContain("https://suzumemo.test/settings");
  });

  it("rejects group_ownership_transferred with empty newOwnerDisplayName", () => {
    const result = validatePayloadForTemplate("group_ownership_transferred", {
      groupName: "山田家",
      newOwnerDisplayName: "  ",
    });
    expect(result.success).toBe(false);
  });

  it("builds group_deleted email", async () => {
    const built = await buildTransactionalEmail("group_deleted", { groupName: "山田家" });
    expect(built.subject).toBe("「山田家」が削除されました | Suzumemo");
    expect(built.text).toContain("「山田家」が削除されました");
    expect(built.text).toContain("家計データも削除され");
    expect(built.text).toContain("https://suzumemo.test/");
  });

  it("builds group_deletion_failed email with a direct status link", async () => {
    const built = await buildTransactionalEmail("group_deletion_failed", {
      groupName: "山田家",
      jobId: "job-123",
    });
    expect(built.subject).toBe("「山田家」の削除を完了できませんでした | Suzumemo");
    expect(built.text).toContain("https://suzumemo.test/group/delete/status/job-123");
  });

  it("rejects group_deletion_failed without a jobId", () => {
    expect(
      validatePayloadForTemplate("group_deletion_failed", { groupName: "山田家" }).success,
    ).toBe(false);
  });

  it("builds ai_review_required email", async () => {
    const built = await buildTransactionalEmail("ai_review_required", { pendingCount: 2 });
    expect(built.subject).toBe("確認が必要なレシートが2件あります | Suzumemo");
    expect(built.text).toContain("2件だけ確認したいところがあります");
    expect(built.text).toContain("https://suzumemo.test/weeks/current/input");
    expect(built.text).toContain("確認する");
  });

  it("rejects ai_review_required with invalid pendingCount", () => {
    expect(validatePayloadForTemplate("ai_review_required", { pendingCount: 0 }).success).toBe(
      false,
    );
    expect(validatePayloadForTemplate("ai_review_required", { pendingCount: 1.5 }).success).toBe(
      false,
    );
    expect(validatePayloadForTemplate("ai_review_required", { pendingCount: "2" }).success).toBe(
      false,
    );
  });

  it("rejects empty groupName", () => {
    expect(
      validatePayloadForTemplate("group_membership_removed", { groupName: "  " }).success,
    ).toBe(false);
    expect(validatePayloadForTemplate("group_deleted", { groupName: "" }).success).toBe(false);
  });

  it("returns subject for known template", () => {
    expect(getTemplateSubject("email_delivery_test")).toBe("Suzumemo メール配信テスト");
    expect(getTemplateSubject("group_membership_removed")).toBe(
      "「{groupName}」から外れました | Suzumemo",
    );
  });

  it("includes the notification settings link in HTML and text for all templates", async () => {
    const cases: Array<[TransactionalEmailType, unknown]> = [
      ["email_delivery_test", { to: "user@example.com" }],
      ["group_membership_removed", { groupName: "山田家" }],
      ["group_role_changed", { groupName: "山田家", previousRole: "member", newRole: "owner" }],
      ["group_ownership_received", { groupName: "山田家" }],
      ["group_ownership_transferred", { groupName: "山田家", newOwnerDisplayName: "花子" }],
      ["group_deletion_started", { groupName: "山田家" }],
      ["group_deletion_failed", { groupName: "山田家", jobId: "job-1" }],
      ["group_deleted", { groupName: "山田家" }],
      ["ai_review_required", { pendingCount: 2 }],
      ["account_deletion_completed", { leftGroupCount: 1, deletedGroupCount: 0 }],
    ];
    for (const [type, payload] of cases) {
      const built = await buildTransactionalEmail(type, payload);
      expect(built.html, `${type} html`).toContain("/settings#notifications");
      expect(built.html, `${type} html`).toContain("通知設定を変更");
      expect(built.text, `${type} text`).toContain("/settings#notifications");
    }
  });

  it("does not present the footer as an unsubscribe link", async () => {
    const built = await buildTransactionalEmail("group_deleted", { groupName: "山田家" });
    expect(built.text).toContain("個別に停止できません");
    expect(built.text).not.toContain("配信停止");
  });
});

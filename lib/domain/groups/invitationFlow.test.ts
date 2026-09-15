import { describe, expect, it } from "vitest";
import {
  buildGroupInvitationRecordInput,
  ClerkInvitationDomainError,
  requireInvitationGroup,
  resolveInvitationEmail,
  type InvitationGroupRecord,
} from "./invitationFlow";

const group: InvitationGroupRecord = {
  _id: "group-001",
  name: "佐藤家",
  clerkOrganizationId: null,
  role: "owner",
  createdAt: 1000,
};

describe("requireInvitationGroup", () => {
  it("グループが無ければドメインエラーを投げる", () => {
    expect(() => requireInvitationGroup(null)).toThrowError(
      new ClerkInvitationDomainError("グループを選択してください"),
    );
  });

  it("非オーナーなら owner_only 文言でドメインエラーを投げる", () => {
    expect(() => requireInvitationGroup({ ...group, role: "member" })).toThrowError(
      new ClerkInvitationDomainError("グループオーナーのみ実行できます"),
    );
  });

  it("オーナーのグループはそのまま返す", () => {
    expect(requireInvitationGroup(group)).toBe(group);
  });
});

describe("resolveInvitationEmail", () => {
  it("前後空白を除去し小文字化する", () => {
    expect(resolveInvitationEmail(" Member@Example.com ")).toBe("member@example.com");
  });

  it("空白のみならドメインエラーを投げる", () => {
    expect(() => resolveInvitationEmail("   ")).toThrowError(
      new ClerkInvitationDomainError("メールアドレスを入力してください"),
    );
  });
});

describe("buildGroupInvitationRecordInput", () => {
  it("clerkInvitationId 未指定ならキーを含めない", () => {
    const record = buildGroupInvitationRecordInput({
      groupId: "g1",
      email: "a@example.com",
      token: "t1",
      invitedByUserId: "u1",
    });
    expect(record).toEqual({
      groupId: "g1",
      email: "a@example.com",
      token: "t1",
      invitedByUserId: "u1",
    });
    expect("clerkInvitationId" in record).toBe(false);
  });

  it("clerkInvitationId 指定時はキーを含める", () => {
    const record = buildGroupInvitationRecordInput({
      groupId: "g1",
      email: "a@example.com",
      token: "t1",
      invitedByUserId: "u1",
      clerkInvitationId: "ci-1",
    });
    expect(record.clerkInvitationId).toBe("ci-1");
  });
});

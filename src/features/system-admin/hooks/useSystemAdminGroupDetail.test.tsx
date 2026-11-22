import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useActionMock, useMutationMock } = vi.hoisted(() => ({
  useActionMock: vi.fn(),
  useMutationMock: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useAction: useActionMock,
  useMutation: useMutationMock,
}));

import { useSystemAdminGroupDetail } from "./useSystemAdminGroupDetail";

const member = (userDocumentId: string, displayName: string) => ({
  userDocumentId,
  userId: userDocumentId,
  displayName,
  email: null,
  role: "owner" as const,
});

describe("useSystemAdminGroupDetail", () => {
  const getGroupDetailMock = vi.fn();
  const roleOperateMock = vi.fn();

  beforeEach(() => {
    getGroupDetailMock.mockResolvedValue({
      id: "g1",
      name: "グループ",
      status: "active",
      environment: "preview",
      members: [],
      invitations: [],
    });
    roleOperateMock.mockResolvedValue(undefined);
    useActionMock.mockReturnValue(getGroupDetailMock);
    // useMutation は membership / roleOperation / recovery の順に各レンダーで
    // 3回呼ばれる（revokeInvitation は useAction）。生成済み api 参照は呼び出しごとに
    // 別objectになるため参照比較ではなく呼出順で振り分ける（roleOperation は2番目）。
    let mutationCall = 0;
    useMutationMock.mockImplementation(() => {
      mutationCall += 1;
      return mutationCall % 3 === 2 ? roleOperateMock : vi.fn();
    });
  });

  it("owner付替えの完了メッセージは付替元→付替先を示す", async () => {
    const { result } = renderHook(() => useSystemAdminGroupDetail("g1"));
    await waitFor(() => expect(result.current.detail).not.toBeUndefined());

    act(() => {
      result.current.requestRoleChange(member("new-owner-doc", "新オーナー"), "owner_transfer");
      result.current.selectRoleSource(member("old-owner-doc", "旧オーナー"));
    });
    await act(async () => {
      await result.current.executeRoleOperation("委任");
    });

    expect(roleOperateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "transfer_owner",
        targetUserId: "new-owner-doc",
        sourceOwnerUserId: "old-owner-doc",
      }),
    );
    expect(result.current.success).toBe(
      "「旧オーナー」から「新オーナー」へownerを付け替えました（監査ログに記録済み）",
    );
  });

  it("role変更の完了メッセージは対象と新roleを示す", async () => {
    const { result } = renderHook(() => useSystemAdminGroupDetail("g1"));
    await waitFor(() => expect(result.current.detail).not.toBeUndefined());

    act(() => {
      result.current.requestRoleChange(member("member-doc", "メンバー"), "role_change", "owner");
    });
    await act(async () => {
      await result.current.executeRoleOperation("権限調整");
    });

    expect(result.current.success).toBe(
      "「メンバー」のroleをオーナーに変更しました（監査ログに記録済み）",
    );
  });
});

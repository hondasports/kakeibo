import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DETAIL_LIST_LIMIT } from "../../../../lib/domain/systemAdmin/searchQuery";
import type { GroupDetail } from "../hooks/useSystemAdminGroupDetail";
import { GroupMembersSection } from "./GroupMembersSection";

const baseDetail: GroupDetail = {
  name: "家計A",
  id: "group-1",
  status: "active",
  environment: "preview",
  members: [
    {
      userDocumentId: "u1",
      userId: "user-1",
      displayName: "ユーザー1",
      email: "u1@example.com",
      role: "owner",
    },
  ],
  invitations: [],
};

function renderSection(detail: GroupDetail) {
  return render(
    <MemoryRouter>
      <GroupMembersSection
        detail={detail}
        stale={false}
        ownerless={false}
        ownerCount={1}
        roleTarget={null}
        roleOperation={null}
        roleSource={null}
        onRequestRemove={vi.fn()}
        onRequestRoleChange={vi.fn()}
        onSelectRoleSource={vi.fn()}
        onCancelRoleOperation={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe("GroupMembersSection", () => {
  it("打ち切り時は実際の取得上限（DETAIL_LIST_LIMIT=50）を警告に表示する", () => {
    renderSection({ ...baseDetail, membersTruncated: true });
    expect(
      screen.getByText(`上限${DETAIL_LIST_LIMIT}件まで表示しています`, { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText(/上限50件まで表示しています/)).toBeInTheDocument();
  });

  it("未打ち切りでは警告を出さない", () => {
    renderSection(baseDetail);
    expect(screen.queryByText(/上限.*件まで表示しています/)).not.toBeInTheDocument();
  });
});

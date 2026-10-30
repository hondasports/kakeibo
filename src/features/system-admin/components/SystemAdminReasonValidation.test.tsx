import { useState } from "react";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeSystemAdminReason,
  getNormalizeReasonErrorMessage,
} from "../../../../lib/domain/systemAdmin/reason";
import { SystemAdminMembershipChangeDialog } from "./SystemAdminMembershipChangeDialog";
import { SystemAdminInvitationRevokeDialog } from "./SystemAdminInvitationRevokeDialog";
import { GroupDeletionResumeDialog } from "./GroupDeletionResumeDialog";
import { GroupOwnerlessRecoveryDialog } from "./GroupOwnerlessRecoveryDialog";
import type { Id } from "../../../../convex/_generated/dataModel";

function Controlled({ kind }: { kind: "deletion" | "recovery" }) {
  const [reason, setReason] = useState("");
  return kind === "deletion" ? (
    <GroupDeletionResumeDialog
      open
      targetGroupNameSnapshot="group"
      reason={reason}
      saving={false}
      error=""
      onReasonChange={setReason}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />
  ) : (
    <GroupOwnerlessRecoveryDialog
      open
      group={{ id: "g", name: "group" }}
      target={{
        userDocumentId: "u" as Id<"users">,
        userId: "u",
        displayName: "user",
        email: null,
        role: "member",
      }}
      reason={reason}
      recovering={false}
      error=""
      onReasonChange={setReason}
      onCancel={vi.fn()}
      onConfirm={vi.fn()}
    />
  );
}

afterEach(cleanup);
describe("管理操作の理由の境界", () => {
  it.each(["membership", "invitation", "deletion", "recovery"] as const)(
    "%s の表示と送信可否はサーバーの理由判定と一致する",
    (kind) => {
      if (kind === "membership")
        render(
          <SystemAdminMembershipChangeDialog
            open
            operation="remove"
            target={{ id: "u", displayName: "user", email: null, activeGroupId: null }}
            environment="preview"
            confirming={false}
            onCancel={vi.fn()}
            onConfirm={vi.fn()}
          />,
        );
      else if (kind === "invitation")
        render(
          <SystemAdminInvitationRevokeDialog
            open
            group={{ id: "g", name: "group" }}
            invitation={{ id: "i", email: "a@example.test", createdAt: 0 }}
            confirming={false}
            onCancel={vi.fn()}
            onConfirm={vi.fn()}
          />,
        );
      else render(<Controlled kind={kind} />);
      const input = screen.getByRole("textbox");
      const button = screen.getByRole("button", {
        name:
          kind === "membership"
            ? "実行する"
            : kind === "invitation"
              ? "取り消す"
              : kind === "deletion"
                ? "再開する"
                : "復旧する",
      });
      for (const value of ["", "   ", `  ${"a".repeat(500)}  `, `  ${"a".repeat(501)}  `, ""]) {
        fireEvent.change(input, { target: { value } });
        const result = normalizeSystemAdminReason(value);
        if (result.success) {
          expect(button).toBeEnabled();
          expect(input).not.toHaveAttribute("aria-invalid", "true");
        } else {
          expect(button).toBeDisabled();
          if (value === "" && (kind === "deletion" || kind === "recovery")) {
            expect(input).not.toHaveAttribute("aria-invalid", "true");
            expect(
              screen.queryByText(getNormalizeReasonErrorMessage(result.error)),
            ).not.toBeInTheDocument();
          } else {
            expect(input).toHaveAttribute("aria-invalid", "true");
            expect(
              screen.getByText(getNormalizeReasonErrorMessage(result.error)),
            ).toBeInTheDocument();
          }
        }
      }
    },
  );
});

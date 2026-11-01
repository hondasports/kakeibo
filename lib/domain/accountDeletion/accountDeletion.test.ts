import { describe, expect, it } from "vitest";
import { isValidAccountDeletionConfirmation } from "./confirmation";
import { getAccountDeletionErrorCategory } from "./errorCategory";
import { resolveAccountDeletionResumeStatus } from "./resume";
import {
  accountDeletionActiveStatuses,
  isActiveAccountDeletionStatus,
  isAccountDeletionFinalizableStatus,
} from "./status";

describe("isActiveAccountDeletionStatus", () => {
  it("完了以外の各状態を active として列挙する", () => {
    expect(accountDeletionActiveStatuses).toEqual([
      "requested",
      "preparing_groups",
      "purging_groups",
      "deleting_identity",
      "retry_wait",
      "identity_deleted",
      "finalization_retry_wait",
      "failed",
    ]);
    for (const status of accountDeletionActiveStatuses) {
      expect(isActiveAccountDeletionStatus(status)).toBe(true);
    }
    expect(isActiveAccountDeletionStatus("unknown")).toBe(false);
  });

  it("完了は active でない", () => {
    expect(isActiveAccountDeletionStatus("completed")).toBe(false);
  });
});

describe("isAccountDeletionFinalizableStatus", () => {
  it("identity_deleted と finalization_retry_wait は最終化可能", () => {
    expect(isAccountDeletionFinalizableStatus("identity_deleted")).toBe(true);
    expect(isAccountDeletionFinalizableStatus("finalization_retry_wait")).toBe(true);
  });

  it("それ以外は最終化不可", () => {
    expect(isAccountDeletionFinalizableStatus("preparing_groups")).toBe(false);
    expect(isAccountDeletionFinalizableStatus("completed")).toBe(false);
  });
});

describe("resolveAccountDeletionResumeStatus", () => {
  it("identityDeletedAt があれば identity_deleted", () => {
    expect(resolveAccountDeletionResumeStatus({ identityDeletedAt: 1 })).toBe("identity_deleted");
  });

  it("preparationCompletedAt があれば purging_groups", () => {
    expect(resolveAccountDeletionResumeStatus({ preparationCompletedAt: 1 })).toBe(
      "purging_groups",
    );
  });

  it("どちらもなければ preparing_groups", () => {
    expect(resolveAccountDeletionResumeStatus({})).toBe("preparing_groups");
  });
});

describe("getAccountDeletionErrorCategory", () => {
  it("failed のときは lastErrorCode かデフォルトを返す", () => {
    expect(getAccountDeletionErrorCategory("failed", "some_error")).toBe("some_error");
    expect(getAccountDeletionErrorCategory("failed")).toBe("identity_deletion_failed");
  });

  it("failed 以外は null", () => {
    expect(getAccountDeletionErrorCategory("preparing_groups")).toBeNull();
  });
});

describe("isValidAccountDeletionConfirmation", () => {
  it("削除 のみ有効", () => {
    expect(isValidAccountDeletionConfirmation("削除")).toBe(true);
    expect(isValidAccountDeletionConfirmation("消去")).toBe(false);
  });
});

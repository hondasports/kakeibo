import { describe, expect, it } from "vitest";
import { getSectionKey, queueSectionLabels } from "./labels";

describe("queue section labels", () => {
  it("主要5状態へ統一マッピングする", () => {
    expect(getSectionKey("needs_review")).toBe("needs_review");
    expect(getSectionKey("ready")).toBe("ready");
    expect(getSectionKey("registering")).toBe("ready");
    expect(getSectionKey("failed")).toBe("failed");
    expect(getSectionKey("registered")).toBe("registered");
    expect(getSectionKey("adding")).toBe("processing");
    expect(getSectionKey("queued")).toBe("processing");
    expect(getSectionKey("analyzing")).toBe("processing");
    expect(queueSectionLabels.processing).toBe("読み取り中");
    expect(queueSectionLabels.ready).toBe("登録できます");
    expect(queueSectionLabels.failed).toBe("読み取り失敗");
  });
});

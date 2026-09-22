import { describe, expect, it } from "vitest";
import { displayStatusLabels, getDisplayStatus, getSectionKey } from "./labels";

describe("queue display status labels", () => {
  it("主要5状態へ統一マッピングする", () => {
    expect(getDisplayStatus("needs_review")).toBe("needs_review");
    expect(getDisplayStatus("ready")).toBe("ready");
    expect(getDisplayStatus("registering")).toBe("ready");
    expect(getDisplayStatus("failed")).toBe("failed");
    expect(getDisplayStatus("registered")).toBe("registered");
    expect(getDisplayStatus("adding")).toBe("processing");
    expect(getDisplayStatus("queued")).toBe("processing");
    expect(getDisplayStatus("analyzing")).toBe("processing");
    expect(getSectionKey("registering")).toBe("ready");
    expect(displayStatusLabels.processing).toBe("読み取り中");
    expect(displayStatusLabels.ready).toBe("登録できます");
    expect(displayStatusLabels.failed).toBe("読み取り失敗");
  });
});

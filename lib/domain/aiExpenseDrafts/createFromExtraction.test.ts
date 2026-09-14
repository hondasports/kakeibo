import { describe, expect, it } from "vitest";
import {
  buildExtractedDraftFields,
  buildExtractedDraftItemFields,
  buildFailedDraftFields,
  validateDraftCategoryOwnership,
} from "./createFromExtraction";

const actor = { userId: "u1", groupId: "g1" };

describe("validateDraftCategoryOwnership", () => {
  it("categoryId 未指定は検証不要", () => {
    expect(validateDraftCategoryOwnership(undefined, null, "g1")).toEqual({ success: true });
  });
  it("不在・他グループは not_in_group", () => {
    expect(validateDraftCategoryOwnership("c1", null, "g1")).toEqual({
      success: false,
      error: "not_in_group",
    });
    expect(validateDraftCategoryOwnership("c1", { groupId: "g2" }, "g1")).toEqual({
      success: false,
      error: "not_in_group",
    });
  });
  it("同グループは成功", () => {
    expect(validateDraftCategoryOwnership("c1", { groupId: "g1" }, "g1")).toEqual({
      success: true,
    });
  });
});

describe("buildExtractedDraftFields", () => {
  const baseArgs = {
    documentType: "receipt" as const,
    shopName: "店",
    date: "2024-01-05",
    amountYen: 1000,
    categoryId: "c1",
    confidence: { shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
    warnings: [],
    items: [],
  };

  it("actor・sourceType・契約版・タイムスタンプを設定し aiValues を receiptInterpretation に保持する", () => {
    const { draft, values } = buildExtractedDraftFields(actor, baseArgs, 123);
    expect(draft).toMatchObject({
      groupId: "g1",
      createdByUserId: "u1",
      sourceType: "image_upload",
      receiptDataContractVersion: 1,
      shopName: "店",
      amountYen: 1000,
      categoryId: "c1",
      createdAt: 123,
      updatedAt: 123,
    });
    expect(draft.rawObservation).toBeUndefined();
    expect(draft.receiptInterpretation).toMatchObject({
      source: "ai",
      interpretedAt: 123,
      values: { shopName: "店", items: [] },
    });
    expect(draft.receiptUserOverride).toBeUndefined();
    expect(values.status).toBe(draft.status);
  });

  it("rawObservationLines 指定時のみ rawObservation を作る", () => {
    const { draft } = buildExtractedDraftFields(
      actor,
      { ...baseArgs, rawObservationLines: [{ index: 0, text: "x" }] as never },
      5,
    );
    expect(draft.rawObservation).toMatchObject({ source: "ai_ocr", observedAt: 5 });
  });

  it("preservedUserOverride は下書き本体へ反映し、aiValues には反映しない", () => {
    const override = {
      source: "user" as const,
      updatedAt: 1,
      fields: ["shopName"],
      values: {
        status: "ready" as const,
        documentType: "receipt" as const,
        shopName: "上書き店",
        confidence: {},
        warnings: [],
        reviewReasons: [],
        items: [],
      },
    };
    const { draft, values } = buildExtractedDraftFields(
      actor,
      { ...baseArgs, preservedUserOverride: override as never },
      5,
    );
    expect(values.shopName).toBe("上書き店");
    expect(draft.shopName).toBe("上書き店");
    expect(draft.receiptInterpretation.values.shopName).toBe("店");
    expect(draft.receiptUserOverride).toBe(override);
  });
});

describe("buildExtractedDraftItemFields", () => {
  it("明細フィールドを groupId/draftId/now とともに構築する", () => {
    const fields = buildExtractedDraftItemFields(
      "g1",
      "d1",
      { itemName: "商品", amountYen: 100, categoryId: "c1", confidence: { itemName: 1 } },
      7,
    );
    expect(fields).toMatchObject({
      groupId: "g1",
      draftId: "d1",
      itemName: "商品",
      amountYen: 100,
      categoryId: "c1",
      confidence: { itemName: 1 },
      createdAt: 7,
      updatedAt: 7,
    });
    expect(fields.taxAllocationStatus).toBeUndefined();
  });
});

describe("buildFailedDraftFields", () => {
  it("failed/unknown/parse_failed で構築する", () => {
    expect(
      buildFailedDraftFields(actor, { warning: "解析失敗", imageFileName: "a.jpg" }, 9),
    ).toEqual({
      groupId: "g1",
      createdByUserId: "u1",
      sourceType: "image_upload",
      status: "failed",
      documentType: "unknown",
      imageFileName: "a.jpg",
      confidence: {},
      warnings: ["解析失敗"],
      reviewReasons: ["parse_failed"],
      createdAt: 9,
      updatedAt: 9,
    });
  });
});

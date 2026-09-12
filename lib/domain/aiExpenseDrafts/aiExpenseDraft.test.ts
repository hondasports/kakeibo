import { describe, expect, it } from "vitest";
import { AiExpenseDraft, type AiExpenseDraftFields } from "./aiExpenseDraft";
import { buildDerivedRegistration } from "./registration";
import { resolveReviewRegistrationMode } from "./review";

function draftFields(overrides: Partial<AiExpenseDraftFields> = {}): AiExpenseDraftFields {
  return {
    id: "draft-1",
    groupId: "group-1",
    sourceType: "image_upload",
    status: "ready",
    documentType: "receipt",
    date: "2025-01-15",
    amountYen: 1000,
    categoryId: "cat-1",
    confidence: {},
    reviewReasons: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe("AiExpenseDraft", () => {
  it("belongsToGroup は groupId の一致を判定する", () => {
    const draft = AiExpenseDraft.fromPersisted(draftFields());
    expect(draft.belongsToGroup("group-1")).toBe(true);
    expect(draft.belongsToGroup("other-group")).toBe(false);
  });

  it("assertDeletableFromQueue は registered を拒否する", () => {
    const deletable = AiExpenseDraft.fromPersisted(draftFields());
    expect(() => deletable.assertDeletableFromQueue()).not.toThrow();

    const registered = AiExpenseDraft.fromPersisted(draftFields({ status: "registered" }));
    expect(() => registered.assertDeletableFromQueue()).toThrow(
      "Registered AI expense draft cannot be deleted from the queue",
    );
  });

  it("assertEditableFromQueue は registered と非レビュー状態を拒否する", () => {
    const ready = AiExpenseDraft.fromPersisted(draftFields());
    expect(() => ready.assertEditableFromQueue()).not.toThrow();

    const registered = AiExpenseDraft.fromPersisted(draftFields({ status: "registered" }));
    expect(() => registered.assertEditableFromQueue()).toThrow(
      "Registered AI expense draft cannot be edited",
    );

    const queued = AiExpenseDraft.fromPersisted(draftFields({ status: "queued" }));
    expect(() => queued.assertEditableFromQueue()).toThrow(
      "Only needs_review or ready AI expense drafts can be edited",
    );
  });

  it("assertReviewableFromQueue は registered+receipt 登録をレガシーとして拒否する", () => {
    const legacy = AiExpenseDraft.fromPersisted(
      draftFields({ status: "registered", registeredReceiptId: "receipt-1" }),
    );
    expect(() => legacy.assertReviewableFromQueue()).toThrow(
      "Legacy receipt registrations cannot be edited from the AI queue",
    );

    const registeredEntries = AiExpenseDraft.fromPersisted(
      draftFields({
        status: "registered",
        derivedRegistration: {
          source: "derived",
          destination: "expense_entries",
          amountYen: 1000,
          date: "2025-01-15",
          categoryIds: ["cat-1"],
          registeredAt: 1000,
        },
      }),
    );
    expect(() => registeredEntries.assertReviewableFromQueue()).not.toThrow();

    const analyzing = AiExpenseDraft.fromPersisted(draftFields({ status: "analyzing" }));
    expect(() => analyzing.assertReviewableFromQueue()).toThrow(
      "Only needs_review or ready AI expense drafts can be edited",
    );
  });

  it("assertEditableFromHistory は registered 以外とレガシー receipt を拒否する", () => {
    const ready = AiExpenseDraft.fromPersisted(draftFields());
    expect(() => ready.assertEditableFromHistory()).toThrow(
      "Only registered AI expense drafts can be edited from history",
    );

    const legacy = AiExpenseDraft.fromPersisted(
      draftFields({ status: "registered", registeredReceiptId: "receipt-1" }),
    );
    expect(() => legacy.assertEditableFromHistory()).toThrow(
      "Legacy receipt registrations cannot be edited from history",
    );

    const registered = AiExpenseDraft.fromPersisted(draftFields({ status: "registered" }));
    expect(() => registered.assertEditableFromHistory()).not.toThrow();
  });

  it("assertResettableToAiInterpretation は registered と解釈スナップショット無しを拒否する", () => {
    const noInterpretation = AiExpenseDraft.fromPersisted(draftFields());
    expect(() => noInterpretation.assertResettableToAiInterpretation()).toThrow(
      "AI interpretation snapshot is not available for this legacy draft",
    );

    const registered = AiExpenseDraft.fromPersisted(draftFields({ status: "registered" }));
    expect(() => registered.assertResettableToAiInterpretation()).toThrow(
      "Registered AI expense draft cannot be reset",
    );
  });

  it("assertHasTaxInterpretationBasis は合計または税集計が無い場合に拒否する", () => {
    const noAmount = AiExpenseDraft.fromPersisted(draftFields({ amountYen: undefined }));
    expect(() => noAmount.assertHasTaxInterpretationBasis()).toThrow(
      "Tax reinterpretation requires draft amount and tax summaries",
    );

    const noSummaries = AiExpenseDraft.fromPersisted(draftFields({ taxSummaries: [] }));
    expect(() => noSummaries.assertHasTaxInterpretationBasis()).toThrow(
      "Tax reinterpretation requires draft amount and tax summaries",
    );
  });

  it("registrationMode は未設定を detailed として解決する", () => {
    const unset = AiExpenseDraft.fromPersisted(draftFields());
    expect(unset.registrationMode).toBe("detailed");

    const totalOnly = AiExpenseDraft.fromPersisted(draftFields({ registrationMode: "totalOnly" }));
    expect(totalOnly.registrationMode).toBe("totalOnly");
  });
});

describe("buildDerivedRegistration", () => {
  it("totalOnly の場合は税フィールドを null で埋める", () => {
    const registration = buildDerivedRegistration({
      destination: "expense_entries",
      registrationMode: "totalOnly",
      amountYen: 1000,
      date: "2025-01-15",
      categoryIds: ["cat-1"],
      registeredAt: 2000,
    });
    expect(registration).toEqual({
      source: "derived",
      destination: "expense_entries",
      registrationMode: "totalOnly",
      taxRatePercent: null,
      taxableAmountYen: null,
      taxYen: null,
      amountYen: 1000,
      date: "2025-01-15",
      categoryIds: ["cat-1"],
      registeredAt: 2000,
    });
  });

  it("detailed の場合は税フィールドを含めない", () => {
    const registration = buildDerivedRegistration({
      destination: "receipt",
      registrationMode: "detailed",
      amountYen: 1000,
      date: "2025-01-15",
      categoryIds: ["cat-1", "cat-2"],
      registeredAt: 2000,
    });
    expect(registration).toEqual({
      source: "derived",
      destination: "receipt",
      registrationMode: "detailed",
      amountYen: 1000,
      date: "2025-01-15",
      categoryIds: ["cat-1", "cat-2"],
      registeredAt: 2000,
    });
    expect("taxRatePercent" in registration).toBe(false);
  });
});

describe("resolveReviewRegistrationMode", () => {
  it("税判定が unknown なら totalOnly に強制する", () => {
    expect(
      resolveReviewRegistrationMode(
        { priceTaxTreatment: "unknown" },
        { registrationMode: "detailed" },
      ),
    ).toBe("totalOnly");
    expect(
      resolveReviewRegistrationMode(
        { taxRateComposition: "unknown", registrationMode: "detailed" },
        {},
      ),
    ).toBe("totalOnly");
  });

  it("税判定の明示更新があればデフォルト detailed になる", () => {
    expect(resolveReviewRegistrationMode({ priceTaxTreatment: "included" }, {})).toBe("detailed");
  });

  it("指定があればそれを優先し、無ければ下書きのモードを引き継ぐ", () => {
    expect(resolveReviewRegistrationMode({ registrationMode: "totalOnly" }, {})).toBe("totalOnly");
    expect(resolveReviewRegistrationMode({}, { registrationMode: "totalOnly" })).toBe("totalOnly");
    expect(resolveReviewRegistrationMode({}, {})).toBe("detailed");
  });
});

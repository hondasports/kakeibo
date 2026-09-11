import { describe, expect, test } from "vitest";
import {
  mergeGeneratedAndManualDrafts,
  mergeProductUpdates,
  ProductUpdateValidationError,
  sortProductUpdates,
  validateAppVersion,
  validateProductionProductUpdates,
  validateProductUpdate,
  validateProductUpdateDraft,
} from "./productUpdates";

describe("validateAppVersion", () => {
  test("accepts a valid production version", () => {
    expect(validateAppVersion("2026.07.11-458")).toBe("2026.07.11-458");
  });

  test("rejects a version with a non-zero-padded month", () => {
    expect(() => validateAppVersion("2026.7.11-458")).toThrow(ProductUpdateValidationError);
  });

  test("rejects a version without a run number", () => {
    expect(() => validateAppVersion("2026.07.11")).toThrow(ProductUpdateValidationError);
  });

  test("rejects a version with a trailing hyphen but no run number", () => {
    expect(() => validateAppVersion("2026.07.11-")).toThrow(ProductUpdateValidationError);
  });

  test("rejects a version with a non-numeric run number", () => {
    expect(() => validateAppVersion("2026.07.11-abc")).toThrow(ProductUpdateValidationError);
  });

  test("rejects 'local' in production validation", () => {
    expect(() => validateAppVersion("local")).toThrow(ProductUpdateValidationError);
  });

  test("allows 'local' when explicitly permitted", () => {
    expect(validateAppVersion("local", { allowLocal: true })).toBe("local");
  });
});

describe("validateProductUpdateDraft", () => {
  test("accepts a valid draft", () => {
    expect(() =>
      validateProductUpdateDraft({
        id: "feature-a",
        title: "Feature A",
        summary: "Summary text",
      }),
    ).not.toThrow();
  });

  test("accepts a draft with items", () => {
    expect(() =>
      validateProductUpdateDraft({
        id: "feature-b",
        title: "Feature B",
        summary: "Summary text",
        items: ["item 1", "item 2"],
      }),
    ).not.toThrow();
  });

  test("rejects an empty id", () => {
    expect(() =>
      validateProductUpdateDraft({
        id: "",
        title: "Feature",
        summary: "Summary",
      }),
    ).toThrow(ProductUpdateValidationError);
  });

  test("rejects a duplicate id", () => {
    const seen = new Set(["feature-a"]);
    expect(() =>
      validateProductUpdateDraft({ id: "feature-a", title: "Feature A", summary: "Summary" }, seen),
    ).toThrow(ProductUpdateValidationError);
  });

  test("rejects an empty title", () => {
    expect(() =>
      validateProductUpdateDraft({
        id: "feature-a",
        title: "",
        summary: "Summary",
      }),
    ).toThrow(ProductUpdateValidationError);
  });

  test("rejects an empty summary", () => {
    expect(() =>
      validateProductUpdateDraft({
        id: "feature-a",
        title: "Feature",
        summary: "",
      }),
    ).toThrow(ProductUpdateValidationError);
  });

  test("rejects empty items", () => {
    expect(() =>
      validateProductUpdateDraft({
        id: "feature-a",
        title: "Feature",
        summary: "Summary",
        items: [],
      }),
    ).toThrow(ProductUpdateValidationError);
  });

  test("rejects an empty item string", () => {
    expect(() =>
      validateProductUpdateDraft({
        id: "feature-a",
        title: "Feature",
        summary: "Summary",
        items: ["item 1", ""],
      }),
    ).toThrow(ProductUpdateValidationError);
  });
});

describe("validateProductUpdate", () => {
  test("accepts a valid published update", () => {
    expect(() =>
      validateProductUpdate({
        id: "feature-a",
        title: "Feature A",
        summary: "Summary",
        version: "2026.07.11-458",
        publishedAt: "2026-07-11",
      }),
    ).not.toThrow();
  });

  test("rejects an invalid version", () => {
    expect(() =>
      validateProductUpdate({
        id: "feature-a",
        title: "Feature A",
        summary: "Summary",
        version: "2026.7.11-458",
        publishedAt: "2026-07-11",
      }),
    ).toThrow(ProductUpdateValidationError);
  });

  test("rejects an invalid publishedAt", () => {
    expect(() =>
      validateProductUpdate({
        id: "feature-a",
        title: "Feature A",
        summary: "Summary",
        version: "2026.07.11-458",
        publishedAt: "2026/07/11",
      }),
    ).toThrow(ProductUpdateValidationError);
  });
});

describe("sortProductUpdates", () => {
  test("sorts by version descending, latest run first on the same date", () => {
    const updates = [
      { id: "a", version: "2026.07.11-458", title: "A", summary: "A", publishedAt: "2026-07-11" },
      { id: "b", version: "2026.07.11-462", title: "B", summary: "B", publishedAt: "2026-07-11" },
      { id: "c", version: "2026.07.10-999", title: "C", summary: "C", publishedAt: "2026-07-10" },
    ];

    const sorted = sortProductUpdates(updates);

    expect(sorted.map((u) => u.id)).toEqual(["b", "a", "c"]);
  });
});

describe("mergeProductUpdates", () => {
  test("keeps only unpublished drafts as the current release", () => {
    const pastUpdates = [
      { id: "a", title: "A", summary: "A", version: "2026.07.10-100", publishedAt: "2026-07-10" },
      { id: "b", title: "B", summary: "B", version: "2026.07.10-100", publishedAt: "2026-07-10" },
    ];
    const drafts = [{ id: "c", title: "C", summary: "C" }];

    const { allUpdates, currentUpdates } = mergeProductUpdates({
      pastUpdates,
      drafts,
      appVersion: "2026.07.11-458",
      publishedAt: "2026-07-11",
    });

    expect(currentUpdates.map((u) => u.id)).toEqual(["c"]);
    expect(currentUpdates[0]).toEqual({
      id: "c",
      title: "C",
      summary: "C",
      version: "2026.07.11-458",
      publishedAt: "2026-07-11",
    });
    expect(allUpdates.map((u) => u.id)).toEqual(["c", "a", "b"]);
  });

  test("skips a draft that is already published in the same version", () => {
    const pastUpdates = [
      { id: "a", title: "A", summary: "A", version: "2026.07.11-458", publishedAt: "2026-07-11" },
    ];
    const drafts = [
      { id: "a", title: "A", summary: "A" },
      { id: "b", title: "B", summary: "B" },
    ];

    const { allUpdates, currentUpdates } = mergeProductUpdates({
      pastUpdates,
      drafts,
      appVersion: "2026.07.11-458",
      publishedAt: "2026-07-11",
    });

    expect(currentUpdates.map((u) => u.id)).toEqual(["b"]);
    expect(allUpdates.map((u) => u.id)).toEqual(["a", "b"]);
  });

  test("preserves past updates when the current release has no drafts", () => {
    const pastUpdates = [
      { id: "a", title: "A", summary: "A", version: "2026.07.11-458", publishedAt: "2026-07-11" },
    ];

    const { allUpdates, currentUpdates } = mergeProductUpdates({
      pastUpdates,
      drafts: [],
      appVersion: "2026.07.19-36",
      publishedAt: "2026-07-19",
    });

    expect(currentUpdates).toEqual([]);
    expect(allUpdates).toEqual(pastUpdates);
  });

  test("rejects a draft whose id is already published with a different version", () => {
    const pastUpdates = [
      { id: "a", title: "A", summary: "A", version: "2026.07.10-100", publishedAt: "2026-07-10" },
    ];
    const drafts = [{ id: "a", title: "A", summary: "A" }];

    expect(() =>
      mergeProductUpdates({
        pastUpdates,
        drafts,
        appVersion: "2026.07.11-458",
        publishedAt: "2026-07-11",
      }),
    ).toThrow(ProductUpdateValidationError);
  });

  test("rejects a draft whose id is duplicated in the draft list", () => {
    const pastUpdates: ReturnType<typeof mergeProductUpdates>["allUpdates"] = [];
    const drafts = [
      { id: "a", title: "A", summary: "A" },
      { id: "a", title: "A2", summary: "A2" },
    ];

    expect(() =>
      mergeProductUpdates({
        pastUpdates,
        drafts,
        appVersion: "2026.07.11-458",
        publishedAt: "2026-07-11",
      }),
    ).toThrow(ProductUpdateValidationError);
  });

  test("rejects a multi-PR id that is already published with a different version", () => {
    const pastUpdates = [
      {
        id: "prs-459-460",
        title: "A",
        summary: "A",
        version: "2026.07.10-100",
        publishedAt: "2026-07-10",
      },
    ];
    const drafts = [{ id: "prs-459-460", title: "A", summary: "A" }];

    expect(() =>
      mergeProductUpdates({
        pastUpdates,
        drafts,
        appVersion: "2026.07.11-458",
        publishedAt: "2026-07-11",
      }),
    ).toThrow(ProductUpdateValidationError);
  });
});

describe("mergeGeneratedAndManualDrafts", () => {
  test("returns generated drafts when manual is empty", () => {
    const generated = [
      { id: "pr-1", title: "PR 1", summary: "Summary 1" },
      { id: "pr-2", title: "PR 2", summary: "Summary 2" },
    ];

    const merged = mergeGeneratedAndManualDrafts({ generated, manual: [] });

    expect(merged.map((d) => d.id)).toEqual(["pr-1", "pr-2"]);
  });

  test("manual drafts override generated drafts with the same id", () => {
    const generated = [
      { id: "pr-1", title: "PR 1", summary: "Generated summary" },
      { id: "pr-2", title: "PR 2", summary: "Summary 2" },
    ];
    const manual = [{ id: "pr-1", title: "PR 1", summary: "Manual summary" }];

    const merged = mergeGeneratedAndManualDrafts({ generated, manual });

    expect(merged.map((d) => d.id)).toEqual(["pr-1", "pr-2"]);
    expect(merged[0]).toEqual({ id: "pr-1", title: "PR 1", summary: "Manual summary" });
  });

  test("manual drafts are placed before generated drafts", () => {
    const generated = [{ id: "pr-2", title: "PR 2", summary: "Summary 2" }];
    const manual = [{ id: "pr-1", title: "PR 1", summary: "Summary 1" }];

    const merged = mergeGeneratedAndManualDrafts({ generated, manual });

    expect(merged.map((d) => d.id)).toEqual(["pr-1", "pr-2"]);
  });

  test("rejects duplicate generated ids", () => {
    const generated = [
      { id: "pr-1", title: "PR 1", summary: "Summary 1" },
      { id: "pr-1", title: "PR 1", summary: "Summary 2" },
    ];

    expect(() => mergeGeneratedAndManualDrafts({ generated, manual: [] })).toThrow(
      ProductUpdateValidationError,
    );
  });

  test("rejects duplicate manual ids", () => {
    const manual = [
      { id: "pr-1", title: "PR 1", summary: "Summary 1" },
      { id: "pr-1", title: "PR 1", summary: "Summary 2" },
    ];

    expect(() => mergeGeneratedAndManualDrafts({ generated: [], manual })).toThrow(
      ProductUpdateValidationError,
    );
  });

  test("manual drafts override generated drafts with multi-PR ids", () => {
    const generated = [
      { id: "prs-459-460", title: "Generated title", summary: "Generated summary" },
      { id: "pr-461", title: "PR 461", summary: "Summary 461" },
    ];
    const manual = [{ id: "prs-459-460", title: "Manual title", summary: "Manual summary" }];

    const merged = mergeGeneratedAndManualDrafts({ generated, manual });

    expect(merged.map((d) => d.id)).toEqual(["prs-459-460", "pr-461"]);
    expect(merged[0]).toEqual({
      id: "prs-459-460",
      title: "Manual title",
      summary: "Manual summary",
    });
  });

  test("manual drafts are used when generated is empty", () => {
    const manual = [{ id: "pr-1", title: "Manual PR 1", summary: "Manual summary" }];

    const merged = mergeGeneratedAndManualDrafts({ generated: [], manual });

    expect(merged).toEqual([{ id: "pr-1", title: "Manual PR 1", summary: "Manual summary" }]);
  });
});

describe("validateProductionProductUpdates", () => {
  test("accepts a valid release payload", () => {
    const payload = {
      version: "2026.07.11-458",
      publishedAt: "2026-07-11",
      updates: [
        {
          id: "feature-a",
          title: "Feature A",
          summary: "Summary",
          version: "2026.07.11-458",
          publishedAt: "2026-07-11",
        },
      ],
    };

    expect(() => validateProductionProductUpdates(payload)).not.toThrow();
  });

  test("accepts source cursor metadata for new release payloads", () => {
    const payload = {
      version: "2026.07.19-36",
      publishedAt: "2026-07-19",
      sourceRef: "4b697aee71314a1274f8007ae1678fac0dda57ee",
      sourceMergedAt: "2026-07-19T09:26:28Z",
      updates: [],
    };

    expect(() => validateProductionProductUpdates(payload)).not.toThrow();
  });

  test("rejects incomplete source cursor metadata", () => {
    const payload = {
      version: "2026.07.19-36",
      publishedAt: "2026-07-19",
      sourceRef: "4b697aee71314a1274f8007ae1678fac0dda57ee",
      updates: [],
    };

    expect(() => validateProductionProductUpdates(payload)).toThrow(ProductUpdateValidationError);
  });

  test("accepts sourceSha and pullRequestDecisions for new release payloads", () => {
    const payload = {
      version: "2026.07.19-36",
      publishedAt: "2026-07-19",
      sourceRef: "4b697aee71314a1274f8007ae1678fac0dda57ee",
      sourceMergedAt: "2026-07-19T09:26:28Z",
      sourceSha: "4b697aee71314a1274f8007ae1678fac0dda57ee",
      pullRequestDecisions: [
        { pullRequest: 735, outcome: "published", reason: "category: fix", updateId: "pr-735" },
        { pullRequest: 737, outcome: "skipped", reason: "内部ドキュメントのみ" },
        { pullRequest: 740, outcome: "integration", reason: "統合PR" },
      ],
      updates: [],
    };

    expect(() => validateProductionProductUpdates(payload)).not.toThrow();
  });

  test("rejects an invalid sourceSha", () => {
    const payload = {
      version: "2026.07.19-36",
      publishedAt: "2026-07-19",
      sourceSha: "not-a-sha",
      updates: [],
    };

    expect(() => validateProductionProductUpdates(payload)).toThrow(ProductUpdateValidationError);
  });

  test("rejects pullRequestDecisions with duplicated PR numbers", () => {
    const payload = {
      version: "2026.07.19-36",
      publishedAt: "2026-07-19",
      pullRequestDecisions: [
        { pullRequest: 1, outcome: "skipped", reason: "a" },
        { pullRequest: 1, outcome: "skipped", reason: "b" },
      ],
      updates: [],
    };

    expect(() => validateProductionProductUpdates(payload)).toThrow(ProductUpdateValidationError);
  });

  test("rejects pullRequestDecisions with unknown outcome", () => {
    const payload = {
      version: "2026.07.19-36",
      publishedAt: "2026-07-19",
      pullRequestDecisions: [{ pullRequest: 1, outcome: "maybe", reason: "x" }],
      updates: [],
    };

    expect(() => validateProductionProductUpdates(payload)).toThrow(ProductUpdateValidationError);
  });

  test("rejects a payload whose update version does not match payload version", () => {
    const payload = {
      version: "2026.07.11-458",
      publishedAt: "2026-07-11",
      updates: [
        {
          id: "feature-a",
          title: "Feature A",
          summary: "Summary",
          version: "2026.07.10-100",
          publishedAt: "2026-07-11",
        },
      ],
    };

    expect(() => validateProductionProductUpdates(payload)).toThrow(ProductUpdateValidationError);
  });

  test("rejects a payload whose update publishedAt does not match payload publishedAt", () => {
    const payload = {
      version: "2026.07.11-458",
      publishedAt: "2026-07-11",
      updates: [
        {
          id: "feature-a",
          title: "Feature A",
          summary: "Summary",
          version: "2026.07.11-458",
          publishedAt: "2026-07-10",
        },
      ],
    };

    expect(() => validateProductionProductUpdates(payload)).toThrow(ProductUpdateValidationError);
  });

  test("rejects a payload with duplicate update ids", () => {
    const payload = {
      version: "2026.07.11-458",
      publishedAt: "2026-07-11",
      updates: [
        {
          id: "feature-a",
          title: "Feature A",
          summary: "Summary",
          version: "2026.07.11-458",
          publishedAt: "2026-07-11",
        },
        {
          id: "feature-a",
          title: "Feature A",
          summary: "Summary",
          version: "2026.07.11-458",
          publishedAt: "2026-07-11",
        },
      ],
    };

    expect(() => validateProductionProductUpdates(payload)).toThrow(ProductUpdateValidationError);
  });
});

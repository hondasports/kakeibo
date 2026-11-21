import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QueueActiveContent, QueueRegisteredContent } from "./QueueContent";
import type { QueueContentProps } from "./QueueContent";
import type { AiExpenseQueueItem } from "../../../types/aiExpenseQueue";
import type { AiExpenseQueueBatchSummary } from "../types/types";

const registeredItem: AiExpenseQueueItem = {
  id: "draft-registered-long-name",
  fileName: "17824771095466150171181650108301.jpg",
  status: "registered",
  documentType: "receipt",
  title: "ジャパン 明石稲美店",
  amountYen: 235,
  date: "2026-06-26",
  categoryName: "日用品",
};

function renderQueueContent(
  groupedItems: {
    processing: AiExpenseQueueItem[];
    ready: AiExpenseQueueItem[];
    needs_review: AiExpenseQueueItem[];
    failed: AiExpenseQueueItem[];
    registered: AiExpenseQueueItem[];
  },
  registeredPagination?: {
    registeredHasMore?: boolean;
    registeredIsLoadingMore?: boolean;
    onLoadMoreRegistered?: () => void;
  },
) {
  const items = Object.values(groupedItems).flat();
  const props = {
    clearableCount: 0,
    deletingIds: [] as string[],
    groupedItems,
    itemCount: items.length,
    readyItems: groupedItems.ready,
    sessionBatchSummaries: [],
    unbatchedReadyItems: groupedItems.ready,
    registeringIds: [] as string[],
    registrationError: "",
    selectedReadyIds: [] as string[],
    onClearOpenQueue: vi.fn(async () => {}),
    onDeleteQueueItem: vi.fn(async () => {}),
    onOpenReview: vi.fn(),
    onRegisterReady: vi.fn(async () => {}),
    onRetry: vi.fn(async () => {}),
    onToggleReadySelection: vi.fn(),
  };
  return render(
    <>
      <QueueActiveContent {...props} />
      <QueueRegisteredContent
        deletingIds={props.deletingIds}
        groupedItems={props.groupedItems}
        registeringIds={props.registeringIds}
        selectedReadyIds={props.selectedReadyIds}
        onOpenReview={props.onOpenReview}
        onRegisterReady={props.onRegisterReady}
        onToggleReadySelection={props.onToggleReadySelection}
        registeredHasMore={registeredPagination?.registeredHasMore ?? false}
        registeredIsLoadingMore={registeredPagination?.registeredIsLoadingMore ?? false}
        onLoadMoreRegistered={registeredPagination?.onLoadMoreRegistered ?? (() => {})}
      />
    </>,
  );
}

describe("QueueContent モバイル表示", () => {
  it("ステータスサマリーに折り返し用クラスと flexWrap を付ける", () => {
    const { container } = renderQueueContent({
      processing: [],
      ready: [],
      needs_review: [],
      failed: [],
      registered: [registeredItem],
    });

    const summary = container.querySelector(".ai-expense-queue-status-summary");
    expect(summary).toBeInTheDocument();
    expect(summary).toHaveStyle({ flexWrap: "wrap", width: "100%" });
  });

  it("長いファイル名は折り返し用クラスと title を付ける", () => {
    renderQueueContent({
      processing: [],
      ready: [],
      needs_review: [],
      failed: [],
      registered: [registeredItem],
    });

    const fileName = screen.getByText(registeredItem.fileName!);
    expect(fileName).toHaveClass("ai-expense-queue-item-secondary");
    expect(fileName).toHaveAttribute("title", registeredItem.fileName);
  });
});

describe("QueueContent の一覧制御", () => {
  it("登録済みは初期3件に絞り、残件を明示して展開できる", async () => {
    const user = userEvent.setup();
    const registered = Array.from({ length: 5 }, (_, index) => ({
      ...registeredItem,
      id: `registered-${index}`,
      title: `登録済み ${index + 1}`,
    }));
    renderQueueContent({ processing: [], ready: [], needs_review: [], failed: [], registered });

    expect(screen.getAllByText(/登録済み [1-3]$/)).toHaveLength(3);
    expect(screen.queryByText("登録済み 4")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "残り2件を見る" }));
    expect(screen.getByText("登録済み 5")).toBeInTheDocument();
  });

  it("登録済みに続きがある場合は件数を『N件以上』と表示し、展開後にさらに読み込める", async () => {
    const user = userEvent.setup();
    const onLoadMoreRegistered = vi.fn();
    const registered = Array.from({ length: 5 }, (_, index) => ({
      ...registeredItem,
      id: `registered-${index}`,
      title: `登録済み ${index + 1}`,
    }));
    renderQueueContent(
      { processing: [], ready: [], needs_review: [], failed: [], registered },
      { registeredHasMore: true, onLoadMoreRegistered },
    );

    expect(screen.getByText("5件以上")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "残り2件を見る" }));
    await user.click(screen.getByRole("button", { name: "さらに読み込む" }));
    expect(onLoadMoreRegistered).toHaveBeenCalledTimes(1);
  });

  it("登録済みの読み込み済み件数が3件以下でも続きがあればさらに読み込める", async () => {
    const user = userEvent.setup();
    const onLoadMoreRegistered = vi.fn();
    renderQueueContent(
      {
        processing: [],
        ready: [],
        needs_review: [],
        failed: [],
        registered: [registeredItem],
      },
      { registeredHasMore: true, onLoadMoreRegistered },
    );

    expect(screen.getByText("1件以上")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "さらに読み込む" }));
    expect(onLoadMoreRegistered).toHaveBeenCalledTimes(1);
  });

  it("確認対象を金額不一致、カテゴリ、その他の順に並べる", () => {
    const items: AiExpenseQueueItem[] = [
      {
        ...registeredItem,
        id: "other",
        status: "needs_review",
        title: "その他",
        reviewReasons: ["low_confidence"],
      },
      {
        ...registeredItem,
        id: "category",
        status: "needs_review",
        title: "カテゴリ",
        reviewReasons: ["ambiguous_category"],
      },
      {
        ...registeredItem,
        id: "amount",
        status: "needs_review",
        title: "金額",
        reviewReasons: ["amount_mismatch"],
      },
    ];
    const { container } = renderQueueContent({
      processing: [],
      ready: [],
      needs_review: items,
      failed: [],
      registered: [],
    });
    const titles = [...container.querySelectorAll(".ai-expense-queue-item-title")].map(
      (node) => node.textContent,
    );
    expect(titles).toEqual(["金額", "カテゴリ", "その他"]);
  });

  it("確認対象は初期3件に絞り、残件を明示して展開できる", async () => {
    const user = userEvent.setup();
    const needsReview = Array.from({ length: 5 }, (_, index) => ({
      ...registeredItem,
      id: `needs-review-${index}`,
      status: "needs_review" as const,
      title: `確認対象 ${index + 1}`,
    }));
    renderQueueContent({
      processing: [],
      ready: [],
      needs_review: needsReview,
      failed: [],
      registered: [],
    });

    expect(screen.getAllByText(/確認対象 [1-3]$/)).toHaveLength(3);
    expect(screen.queryByText("確認対象 4")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "残り2件を確認" }));
    expect(screen.getByText("確認対象 5")).toBeInTheDocument();
  });

  it("登録準備OKの下書きから編集ダイアログを開ける", async () => {
    const user = userEvent.setup();
    const onOpenReview = vi.fn();
    const readyItem: AiExpenseQueueItem = {
      ...registeredItem,
      id: "ready-draft",
      status: "ready",
      title: "スーパー北浜",
      amountYen: 4280,
      date: "2026-06-08",
      categoryName: "食費",
    };
    const props = {
      clearableCount: 0,
      deletingIds: [] as string[],
      groupedItems: {
        processing: [],
        ready: [readyItem],
        needs_review: [],
        failed: [],
        registered: [],
      },
      itemCount: 1,
      readyItems: [readyItem],
      sessionBatchSummaries: [],
      unbatchedReadyItems: [readyItem],
      registeringIds: [] as string[],
      registrationError: "",
      selectedReadyIds: [] as string[],
      onClearOpenQueue: vi.fn(async () => {}),
      onDeleteQueueItem: vi.fn(async () => {}),
      onOpenReview,
      onRegisterReady: vi.fn(async () => {}),
      onRetry: vi.fn(async () => {}),
      onToggleReadySelection: vi.fn(),
    };

    render(<QueueActiveContent {...props} />);

    await user.click(screen.getByRole("button", { name: "修正する" }));
    expect(onOpenReview).toHaveBeenCalledWith("ready-draft");
  });
});

describe("まとめて登録ボタンの無効理由", () => {
  const readyItem: AiExpenseQueueItem = {
    ...registeredItem,
    id: "ready-draft",
    status: "ready",
    title: "スーパー北浜",
  };
  const secondReadyItem: AiExpenseQueueItem = {
    ...registeredItem,
    id: "ready-draft-2",
    fileName: "ready-2.png",
    status: "ready",
    title: "スーパー梅田",
  };

  function buildBatchSummary(
    readyItems: AiExpenseQueueItem[],
    overrides: Partial<AiExpenseQueueBatchSummary> = {},
  ): AiExpenseQueueBatchSummary {
    return {
      batchId: "batch-1",
      jobIds: readyItems.map((item) => `job-${item.id}`),
      fileNames: readyItems.map((item) => item.fileName ?? ""),
      totalCount: readyItems.length,
      readyItems,
      queuedCount: 0,
      analyzingCount: 0,
      processingCount: 0,
      readyCount: readyItems.length,
      needsReviewCount: 0,
      failedCount: 0,
      registeredCount: 0,
      missingCount: 0,
      isAllReady: true,
      ...overrides,
    };
  }

  function buildProps(overrides: Partial<QueueContentProps> = {}): QueueContentProps {
    const groupedItems = {
      processing: [],
      ready: [readyItem],
      needs_review: [],
      failed: [],
      registered: [],
    };
    return {
      clearableCount: 0,
      deletingIds: [],
      groupedItems,
      itemCount: 1,
      readyItems: [readyItem],
      sessionBatchSummaries: [],
      unbatchedReadyItems: [readyItem],
      registeringIds: [],
      registrationError: "",
      selectedReadyIds: [],
      onClearOpenQueue: vi.fn(async () => {}),
      onDeleteQueueItem: vi.fn(async () => {}),
      onOpenReview: vi.fn(),
      onRegisterReady: vi.fn(async () => {}),
      onRetry: vi.fn(async () => {}),
      onToggleReadySelection: vi.fn(),
      ...overrides,
    };
  }

  function renderActiveContent(overrides: Partial<QueueContentProps> = {}) {
    return render(<QueueActiveContent {...buildProps(overrides)} />);
  }

  it("未選択のときはチェックを促す理由をボタンに関連付けて表示する", () => {
    renderActiveContent();

    const button = screen.getByRole("button", { name: "まとめて登録（0件）" });
    expect(button).toBeDisabled();
    const reason = screen.getByText("登録する下書きにチェックを入れてください");
    expect(reason).toBeInTheDocument();
    expect(reason.id).not.toBe("");
    expect(button).toHaveAttribute("aria-describedby", reason.id);
  });

  it("1件以上選択すると理由が消えてボタンが有効になる", () => {
    const { rerender } = renderActiveContent();
    expect(screen.getByText("登録する下書きにチェックを入れてください")).toBeInTheDocument();

    rerender(<QueueActiveContent {...buildProps({ selectedReadyIds: ["ready-draft"] })} />);

    const button = screen.getByRole("button", { name: "まとめて登録（1件）" });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText("登録する下書きにチェックを入れてください")).not.toBeInTheDocument();
  });

  it("登録処理中はその旨を理由として表示する", () => {
    renderActiveContent({ registeringIds: ["ready-draft"], selectedReadyIds: ["ready-draft"] });

    const button = screen.getByRole("button", { name: "まとめて登録（1件）" });
    expect(button).toBeDisabled();
    expect(screen.getByText("登録処理中です")).toBeInTheDocument();
  });

  it("解析待ちが残る追加分は解析終了まで登録できない旨を表示する", () => {
    const batchSummary = buildBatchSummary([], {
      isAllReady: false,
      processingCount: 1,
      queuedCount: 1,
      totalCount: 1,
      readyCount: 0,
    });
    renderActiveContent({
      groupedItems: { processing: [], ready: [], needs_review: [], failed: [], registered: [] },
      itemCount: 0,
      readyItems: [],
      sessionBatchSummaries: [batchSummary],
      unbatchedReadyItems: [],
    });

    const button = screen.getByRole("button", { name: "まとめて登録（0件）" });
    expect(button).toBeDisabled();
    expect(screen.getByText("解析が終わるまで登録できません")).toBeInTheDocument();
  });

  it("全件登録可能な追加分は未選択・一部選択で選択を促す理由を表示する", () => {
    const batchSummary = buildBatchSummary([readyItem, secondReadyItem]);
    const batchProps: Partial<QueueContentProps> = {
      groupedItems: {
        processing: [],
        ready: [readyItem, secondReadyItem],
        needs_review: [],
        failed: [],
        registered: [],
      },
      itemCount: 2,
      readyItems: [readyItem, secondReadyItem],
      sessionBatchSummaries: [batchSummary],
      unbatchedReadyItems: [],
    };
    const { rerender } = renderActiveContent({ ...batchProps, selectedReadyIds: [] });

    expect(screen.getByRole("button", { name: "まとめて登録（2件）" })).toBeDisabled();
    expect(screen.getByText("登録する下書きにチェックを入れてください")).toBeInTheDocument();

    rerender(
      <QueueActiveContent {...buildProps({ ...batchProps, selectedReadyIds: ["ready-draft"] })} />,
    );

    expect(screen.getByRole("button", { name: "まとめて登録（2件）" })).toBeDisabled();
    expect(screen.getByText("すべての下書きを選択すると登録できます")).toBeInTheDocument();

    rerender(
      <QueueActiveContent
        {...buildProps({
          ...batchProps,
          selectedReadyIds: ["ready-draft", "ready-draft-2"],
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "まとめて登録（2件）" })).toBeEnabled();
    expect(screen.queryByText("すべての下書きを選択すると登録できます")).not.toBeInTheDocument();
  });
});

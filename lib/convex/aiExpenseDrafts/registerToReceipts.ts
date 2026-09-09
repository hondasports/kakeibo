import { ConvexError } from "convex/values";
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { insertReceiptForGroup } from "../../../convex/receipts/crud";
import { requireGroupMembership } from "../../../convex/groups/membership";
import { resolveReceiptShopNameFromDraft } from "../../domain/aiExpenseDrafts/shopName";
import { buildDraftRegistrationItems, resolveRegistrationMode } from "./reconcileExpenseEntries";
import {
  dedupeDraftIds,
  getReadyDraftRegistrationErrorMessage,
  isAlreadyRegisteredAsReceipt,
  validateReadyDraftForRegistration,
} from "../../domain/aiExpenseDrafts/registration";

type RegisterReadyDraftsArgs = {
  draftIds: Id<"aiExpenseDrafts">[];
};

function assertReadyDraftCanBeRegistered(draft: Doc<"aiExpenseDrafts">) {
  const result = validateReadyDraftForRegistration(draft);
  if (!result.success) {
    throw new ConvexError(getReadyDraftRegistrationErrorMessage(result.error));
  }
}

export async function registerReadyDraftsHandler(ctx: MutationCtx, args: RegisterReadyDraftsArgs) {
  const { groupId, userId } = await requireGroupMembership(ctx);
  const uniqueDraftIds = dedupeDraftIds(args.draftIds);
  if (uniqueDraftIds.length === 0) {
    return {
      registeredDraftIds: [] as Id<"aiExpenseDrafts">[],
      registeredReceiptIds: [] as Id<"receipts">[],
      alreadyRegisteredDraftIds: [] as Id<"aiExpenseDrafts">[],
    };
  }

  const drafts = await Promise.all(
    uniqueDraftIds.map(async (draftId) => {
      const draft = await ctx.db.get(draftId);
      if (draft === null) {
        throw new ConvexError("AI expense draft not found");
      }
      if (draft.groupId !== groupId) {
        throw new ConvexError("AI expense draft does not belong to the current group");
      }
      return draft;
    }),
  );

  const draftsToRegister: Doc<"aiExpenseDrafts">[] = [];
  const alreadyRegisteredDraftIds: Id<"aiExpenseDrafts">[] = [];

  for (const draft of drafts) {
    if (isAlreadyRegisteredAsReceipt(draft)) {
      alreadyRegisteredDraftIds.push(draft._id);
      continue;
    }
    assertReadyDraftCanBeRegistered(draft);
    draftsToRegister.push(draft);
  }

  const registeredReceiptIds: Id<"receipts">[] = [];

  for (const draft of draftsToRegister) {
    // totalOnly の場合は確認済み合計であることを同じ契約で検証する。
    const items =
      resolveRegistrationMode(draft) !== "totalOnly"
        ? await ctx.db
            .query("aiExpenseDraftItems")
            .withIndex("by_group_id_and_draft_id", (q) =>
              q.eq("groupId", groupId).eq("draftId", draft._id),
            )
            .collect()
        : [];
    buildDraftRegistrationItems(draft, items);
    const receiptId = await insertReceiptForGroup(
      ctx,
      groupId,
      {
        type: "expense",
        date: draft.date!,
        shopName: resolveReceiptShopNameFromDraft(draft),
        amountYen: draft.amountYen!,
        categoryId: draft.categoryId!,
      },
      1,
      userId,
    );
    registeredReceiptIds.push(receiptId);
  }

  const now = Date.now();
  await Promise.all(
    draftsToRegister.map((draft, index) =>
      ctx.db.patch(draft._id, {
        status: "registered",
        registeredReceiptId: registeredReceiptIds[index],
        derivedRegistration: {
          source: "derived",
          destination: "receipt",
          registrationMode: resolveRegistrationMode(draft),
          ...(resolveRegistrationMode(draft) === "totalOnly"
            ? { taxRatePercent: null, taxableAmountYen: null, taxYen: null }
            : {}),
          amountYen: draft.amountYen!,
          date: draft.date!,
          categoryIds: [draft.categoryId!],
          registeredAt: now,
        },
        updatedAt: now,
      }),
    ),
  );

  return {
    registeredDraftIds: draftsToRegister.map((draft) => draft._id),
    registeredReceiptIds,
    alreadyRegisteredDraftIds,
  };
}

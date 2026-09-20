function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim().replace(/^["']+|["']+$/g, "");
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

async function postE2eSeed(path: string, body: Record<string, unknown>) {
  const siteUrl = getRequiredEnv("VITE_CONVEX_SITE_URL");
  const secret = getRequiredEnv("E2E_CLEANUP_SECRET");
  const res = await fetch(`${siteUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-E2E-Cleanup-Secret": secret,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`E2E seed ${path} に失敗しました: ${res.status} ${text}`);
  }

  return res.json();
}

export async function seedAiExpenseDraftForExpenseEntriesByUser(userId: string): Promise<{
  draftId: string;
}> {
  return (await postE2eSeed("/e2e/seed-ai-expense-draft", { userId })) as { draftId: string };
}

export async function seedTaxReviewDraftByUser(
  userId: string,
  options?: { savedAsTotalOnly?: boolean },
): Promise<{ draftId: string }> {
  return (await postE2eSeed("/e2e/seed-tax-review-draft", {
    userId,
    ...(options?.savedAsTotalOnly ? { savedAsTotalOnly: true } : {}),
  })) as { draftId: string };
}

export async function seedMixedTaxReviewDraftByUser(userId: string): Promise<{ draftId: string }> {
  return (await postE2eSeed("/e2e/seed-mixed-tax-review-draft", { userId })) as {
    draftId: string;
  };
}

export async function seedTaxSummaryConflictDraftByUser(
  userId: string,
): Promise<{ draftId: string }> {
  return (await postE2eSeed("/e2e/seed-tax-summary-conflict-draft", { userId })) as {
    draftId: string;
  };
}

export async function seedPendingGroupInvitationForUser(
  userId: string,
  invitationEmail: string,
): Promise<{ invitationId: string }> {
  return (await postE2eSeed("/e2e/seed-pending-group-invitation", {
    userId,
    invitationEmail,
  })) as { invitationId: string };
}

export async function seedGroupMemberForUser(
  userId: string,
  memberDisplayName: string,
  memberEmail: string,
): Promise<{ memberUserId: string }> {
  const siteUrl = getRequiredEnv("VITE_CONVEX_SITE_URL");
  const secret = getRequiredEnv("E2E_CLEANUP_SECRET");
  const res = await fetch(`${siteUrl}/e2e/cleanup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-E2E-Cleanup-Secret": secret,
    },
    body: JSON.stringify({
      userId,
      seedGroupMember: { displayName: memberDisplayName, email: memberEmail },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`グループメンバー seed に失敗しました: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { seededGroupMember?: { memberUserId: string } };
  const memberUserId = data.seededGroupMember?.memberUserId;
  if (!memberUserId) {
    throw new Error("グループメンバー seed のレスポンスに memberUserId がありません");
  }

  return { memberUserId };
}

export async function seedUnallocatedTaxDraftByUser(userId: string): Promise<{ draftId: string }> {
  return await postE2eSeed("/e2e/seed-unallocated-tax-draft", { userId });
}

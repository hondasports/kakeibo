/**
 * categories query のユースケース。
 * membership 認可は presentation 層で済んでいる前提で groupId を受け取る。
 */
import { MAX_CATEGORIES_PER_GROUP } from "../../domain/categories/defaults";
import type { CategoryStore, CategoryStoreRecord } from "../../domain/categories/store";

export async function listActive(
  store: Pick<CategoryStore, "listActive">,
  groupId: string,
): Promise<CategoryStoreRecord[]> {
  return await store.listActive(groupId);
}

export async function listForSettings(
  store: Pick<CategoryStore, "listForSettings">,
  groupId: string,
): Promise<CategoryStoreRecord[]> {
  return await store.listForSettings(groupId, MAX_CATEGORIES_PER_GROUP);
}

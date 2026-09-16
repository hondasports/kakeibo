/**
 * groups のドメイン型。
 * Convex の generated 型には依存せず、ID は string として扱う。
 */
import type { GroupLifecycleStatus } from "./lifecycle";

/** groups ドキュメントのフィールド（書き込み用。id は採番前のため含まない）。 */
export type GroupFields = {
  name: string;
  clerkOrganizationId?: string;
  status?: GroupLifecycleStatus;
  deletedAt?: number;
  createdAt: number;
  updatedAt: number;
};

/** 永続化済みの groups レコード。読み取り結果では id が必須。 */
export type GroupRecord = GroupFields & { id: string };

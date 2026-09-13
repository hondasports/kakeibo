/**
 * groups のドメイン型。
 * Convex の generated 型には依存せず、ID は string として扱う。
 */
import type { GroupLifecycleStatus } from "./lifecycle";

/** groups ドキュメントのフィールド。id は永続化済みの場合のみ存在する。 */
export type GroupFields = {
  id?: string;
  name: string;
  clerkOrganizationId?: string;
  status?: GroupLifecycleStatus;
  deletedAt?: number;
  createdAt: number;
  updatedAt: number;
};

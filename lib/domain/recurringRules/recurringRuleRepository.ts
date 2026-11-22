import type { RecurringRule } from "./recurringRule";

export type RecurringRuleRecord = RecurringRule & {
  id: string;
  groupId: string;
  createdByUserId?: string;
  createdAt: number;
  updatedAt: number;
};

export interface RecurringRuleRepository {
  listByGroup(groupId: string): Promise<RecurringRuleRecord[]>;
  findById(id: string): Promise<RecurringRuleRecord | null>;
  insert(rule: Omit<RecurringRuleRecord, "id">): Promise<string>;
  update(id: string, patch: Partial<RecurringRule & { updatedAt: number }>): Promise<void>;
}

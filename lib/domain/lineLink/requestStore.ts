import type { LineLinkRequestFields, LineLinkRequestRecord } from "./records";

export interface LineLinkRequestReader {
  findByStateHash(stateHash: string): Promise<LineLinkRequestRecord | null>;
  getById(requestId: string): Promise<LineLinkRequestRecord | null>;
}

export interface LineLinkRequestStore extends LineLinkRequestReader {
  insert(fields: LineLinkRequestFields): Promise<string>;
  patch(requestId: string, fields: Partial<LineLinkRequestFields>): Promise<void>;
  takeExpired(now: number, limit: number): Promise<LineLinkRequestRecord[]>;
  takeByUserId(userId: string, limit: number): Promise<LineLinkRequestRecord[]>;
  deleteById(requestId: string): Promise<void>;
}

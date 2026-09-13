import type { LineAccountLinkFields, LineAccountLinkRecord } from "./records";

export interface LineAccountLinkReader {
  listActiveByLineUserId(lineUserId: string): Promise<LineAccountLinkRecord[]>;
  listActiveByUserId(userId: string): Promise<LineAccountLinkRecord[]>;
  findLatestActiveByUserId(userId: string): Promise<LineAccountLinkRecord | null>;
  takeByUserId(userId: string, limit: number): Promise<LineAccountLinkRecord[]>;
}

export interface LineAccountLinkStore extends LineAccountLinkReader {
  insert(fields: LineAccountLinkFields): Promise<void>;
  patch(linkId: string, fields: Partial<LineAccountLinkFields>): Promise<void>;
  deleteById(linkId: string): Promise<void>;
}

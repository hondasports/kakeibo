import type { LineAccountLinkFields, LineAccountLinkRecord } from "./records";

export interface LineAccountLinkReader {
  listActiveByLineUserId(lineUserId: string, limit?: number): Promise<LineAccountLinkRecord[]>;
  listActiveByUserId(userId: string, limit?: number): Promise<LineAccountLinkRecord[]>;
}

export interface LineAccountLinkStore extends LineAccountLinkReader {
  takeByUserId(userId: string, limit: number): Promise<LineAccountLinkRecord[]>;
  insert(fields: LineAccountLinkFields): Promise<void>;
  patch(linkId: string, fields: Partial<LineAccountLinkFields>): Promise<void>;
  deleteById(linkId: string): Promise<void>;
}

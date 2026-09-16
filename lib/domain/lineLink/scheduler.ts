export interface LineLinkScheduler {
  scheduleRequestExpiration(delayMs: number, requestId: string): Promise<void>;
}

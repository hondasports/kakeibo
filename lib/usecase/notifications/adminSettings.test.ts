import { describe, expect, it, vi } from "vitest";
import { listNotificationSettings, updateNotificationSetting } from "./adminSettings";

const ADMIN_TOKEN = "admin-token";

function makeDeps({
  adminStatus = "active",
  settings = [],
}: {
  adminStatus?: "active" | "revoked" | null;
  settings?: {
    id: string;
    type: string;
    channel: string;
    enabled: boolean;
    updatedByUserId: string;
    updatedAt: number;
  }[];
} = {}) {
  const insertedSettings: Record<string, unknown>[] = [];
  const patches: { id: string; fields: Record<string, unknown> }[] = [];
  const audits: Record<string, unknown>[] = [];
  const deps = {
    admins: {
      findByUserDocId: vi
        .fn()
        .mockResolvedValue(adminStatus === null ? null : { id: "admin-doc", status: adminStatus }),
    },
    users: {
      findByUserId: vi.fn().mockResolvedValue(adminStatus === null ? null : { docId: "admin-doc" }),
    },
    settings: {
      findByTypeAndChannel: vi.fn((type: string, channel: string) =>
        Promise.resolve(settings.find((s) => s.type === type && s.channel === channel) ?? null),
      ),
      listAll: vi.fn().mockResolvedValue(settings),
      insert: vi.fn(async (fields: Record<string, unknown>) => {
        insertedSettings.push(fields);
        return "setting-new";
      }),
      patch: vi.fn(async (id: string, fields: Record<string, unknown>) => {
        patches.push({ id, fields });
      }),
    },
    auditLogs: {
      insert: vi.fn(async (fields: Record<string, unknown>) => {
        audits.push(fields);
      }),
    },
  };
  return { deps: deps as never, insertedSettings, patches, audits };
}

describe("listNotificationSettings", () => {
  it("returns 10 email + 1 LINE entries with defaults", async () => {
    const { deps } = makeDeps();
    const result = await listNotificationSettings(deps, ADMIN_TOKEN);
    expect(result.items).toHaveLength(11);
    const line = result.items.find((i) => i.channel === "line");
    expect(line).toMatchObject({ type: "ai_review_required", enabled: false, configured: false });
    const aiEmail = result.items.find(
      (i) => i.type === "ai_review_required" && i.channel === "email",
    );
    expect(aiEmail).toMatchObject({ enabled: true, mandatory: false });
    const mandatory = result.items.find((i) => i.type === "group_deleted" && i.channel === "email");
    expect(mandatory).toMatchObject({ enabled: true, mandatory: true });
  });

  it("rejects non-admin and revoked admin", async () => {
    await expect(
      listNotificationSettings(makeDeps({ adminStatus: null }).deps, ADMIN_TOKEN),
    ).rejects.toThrow();
    await expect(
      listNotificationSettings(makeDeps({ adminStatus: "revoked" }).deps, ADMIN_TOKEN),
    ).rejects.toThrow();
  });
});

describe("updateNotificationSetting", () => {
  const baseArgs = {
    tokenIdentifier: ADMIN_TOKEN,
    type: "ai_review_required" as const,
    channel: "line" as const,
    enabled: true,
    reason: "  LINE配信を有効化  ",
  };

  it("rejects non-admin", async () => {
    const { deps } = makeDeps({ adminStatus: null });
    await expect(updateNotificationSetting(deps, baseArgs)).rejects.toThrow();
  });

  it("rejects unsupported channel pairs", async () => {
    const { deps } = makeDeps();
    await expect(
      updateNotificationSetting(deps, { ...baseArgs, type: "group_deleted" }),
    ).rejects.toThrow();
  });

  it("rejects empty and overlong reasons without writing anything", async () => {
    for (const reason of ["   ", "x".repeat(501)]) {
      const { deps, insertedSettings, audits } = makeDeps();
      await expect(updateNotificationSetting(deps, { ...baseArgs, reason })).rejects.toThrow();
      expect(insertedSettings).toHaveLength(0);
      expect(audits).toHaveLength(0);
    }
  });

  it("requires explicit confirmation to disable a mandatory email", async () => {
    const args = {
      ...baseArgs,
      type: "group_deleted" as const,
      channel: "email" as const,
      enabled: false,
    };
    const { deps, insertedSettings, audits } = makeDeps();
    await expect(updateNotificationSetting(deps, args)).rejects.toThrow();
    expect(insertedSettings).toHaveLength(0);
    expect(audits).toHaveLength(0);

    const confirmed = makeDeps();
    const result = await updateNotificationSetting(confirmed.deps, {
      ...args,
      confirmMandatoryEmailDisable: true,
    });
    expect(result).toEqual({ changed: true, enabled: false });
    expect(confirmed.insertedSettings[0]).toMatchObject({ enabled: false });
    expect(confirmed.audits[0]).toMatchObject({
      action: "system_admin_notification_setting_changed",
      targetKind: "notification_setting",
      targetId: "group_deleted:email",
      beforeNotificationEnabled: true,
      afterNotificationEnabled: false,
      result: "success",
    });
  });

  it("updates existing setting and audits before/after", async () => {
    const { deps, patches, audits } = makeDeps({
      settings: [
        {
          id: "s-1",
          type: "ai_review_required",
          channel: "line",
          enabled: false,
          updatedByUserId: "admin-doc",
          updatedAt: 1,
        },
      ],
    });
    const result = await updateNotificationSetting(deps, baseArgs);
    expect(result).toEqual({ changed: true, enabled: true });
    expect(patches[0]).toMatchObject({ id: "s-1", fields: { enabled: true } });
    expect(audits[0]).toMatchObject({
      beforeNotificationEnabled: false,
      afterNotificationEnabled: true,
      reason: "LINE配信を有効化",
      actorUserId: "admin-doc",
    });
  });

  it("treats a change to the effective value as a no-op without audit", async () => {
    const { deps, insertedSettings, audits } = makeDeps();
    const result = await updateNotificationSetting(deps, {
      ...baseArgs,
      type: "group_deleted",
      channel: "email",
      enabled: true,
    });
    expect(result).toEqual({ changed: false, enabled: true });
    expect(insertedSettings).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });
});

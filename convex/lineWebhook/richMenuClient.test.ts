import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LINE_RICH_MENU_NAME,
  buildLineRichMenuObject,
} from "../../lib/domain/lineSummary/richMenu";
import { applyLineDefaultRichMenu } from "./richMenuClient";

function setEnvironment(values: Record<string, string | undefined>) {
  const original = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

function readMenuImage(): Uint8Array {
  return readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../docs/line/rich-menu-readonly-summary.png"),
  );
}

describe("LINE rich menu client", () => {
  beforeEach(() => {
    process.env.APP_ENV = "development";
  });

  it("dry-runでは外部APIへ送信せず、message actionの仕様を返す", async () => {
    const restore = setEnvironment({ LINE_INTEGRATION_MODE: "real" });
    const fetchImpl = vi.fn();
    try {
      const result = await applyLineDefaultRichMenu({
        imageBytes: readMenuImage(),
        dryRun: true,
        fetchImpl,
      });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(result).toEqual({
        dryRun: true,
        mode: "dry-run",
        richMenuId: null,
        menu: buildLineRichMenuObject(),
      });
      expect(result.menu.areas.every((area) => area.action.type === "message")).toBe(true);
    } finally {
      restore();
    }
  });

  it("mock modeのapplyは外部APIへ送信しない", async () => {
    const restore = setEnvironment({ LINE_INTEGRATION_MODE: "mock" });
    const fetchImpl = vi.fn();
    try {
      const result = await applyLineDefaultRichMenu({
        imageBytes: readMenuImage(),
        fetchImpl,
      });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(result.mode).toBe("mock");
      expect(result.richMenuId).toBe("mock-rich-menu-id");
    } finally {
      restore();
    }
  });

  it("productionでもdry-runは許可する", async () => {
    const restore = setEnvironment({
      APP_ENV: "production",
      LINE_INTEGRATION_MODE: "real",
      LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: "access-token-private",
    });
    const fetchImpl = vi.fn();
    try {
      const result = await applyLineDefaultRichMenu({
        imageBytes: readMenuImage(),
        dryRun: true,
        fetchImpl,
      });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(result.mode).toBe("dry-run");
    } finally {
      restore();
    }
  });

  it("productionではapplyを拒否する", async () => {
    const restore = setEnvironment({
      APP_ENV: "production",
      LINE_INTEGRATION_MODE: "real",
      LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: "access-token-private",
    });
    const fetchImpl = vi.fn();
    try {
      await expect(
        applyLineDefaultRichMenu({
          imageBytes: readMenuImage(),
          fetchImpl,
        }),
      ).rejects.toThrow("LINE rich menu apply is not available in production");
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it.each([undefined, "", "prod", "Production", "preview"])(
    "APP_ENV=%sではapplyを拒否する（fail-closed）",
    async (appEnv) => {
      const restore = setEnvironment({
        APP_ENV: appEnv,
        LINE_INTEGRATION_MODE: "real",
        LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: "access-token-private",
      });
      const fetchImpl = vi.fn();
      try {
        await expect(
          applyLineDefaultRichMenu({
            imageBytes: readMenuImage(),
            fetchImpl,
          }),
        ).rejects.toThrow(/APP_ENV/);
        expect(fetchImpl).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    },
  );

  it("APP_ENV未設定でもdry-runは許可する", async () => {
    const restore = setEnvironment({
      APP_ENV: undefined,
      LINE_INTEGRATION_MODE: "real",
      LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: "access-token-private",
    });
    const fetchImpl = vi.fn();
    try {
      const result = await applyLineDefaultRichMenu({
        imageBytes: readMenuImage(),
        dryRun: true,
        fetchImpl,
      });
      expect(result.mode).toBe("dry-run");
    } finally {
      restore();
    }
  });

  it("real modeではcreate・画像upload・default設定・旧メニュー削除を順に呼ぶ", async () => {
    const restore = setEnvironment({
      LINE_INTEGRATION_MODE: "real",
      LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: "access-token-private",
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ richMenuId: "richmenu-new" }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response("", { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            richmenus: [
              { richMenuId: "richmenu-old", name: LINE_RICH_MENU_NAME },
              { richMenuId: "richmenu-new", name: LINE_RICH_MENU_NAME },
              { richMenuId: "richmenu-other", name: "other-menu" },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response("", { status: 200 }));
    try {
      const result = await applyLineDefaultRichMenu({
        imageBytes: readMenuImage(),
        fetchImpl,
      });
      expect(result).toMatchObject({
        dryRun: false,
        mode: "real",
        richMenuId: "richmenu-new",
      });
      expect(fetchImpl).toHaveBeenCalledTimes(5);
      const calls = fetchImpl.mock.calls as Array<[string, RequestInit]>;
      const createCall = calls[0];
      const uploadCall = calls[1];
      const defaultCall = calls[2];
      const deleteCall = calls[4];
      expect(createCall?.[0]).toBe("https://api.line.me/v2/bot/richmenu");
      expect(JSON.parse(String(createCall?.[1].body))).toEqual(buildLineRichMenuObject());
      expect(uploadCall?.[0]).toBe("https://api-data.line.me/v2/bot/richmenu/richmenu-new/content");
      expect(uploadCall?.[1].headers).toEqual(
        expect.objectContaining({
          Authorization: "Bearer access-token-private",
          "Content-Type": "image/png",
        }),
      );
      expect(uploadCall?.[1].body).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(uploadCall?.[1].body as ArrayBuffer)).toEqual(
        new Uint8Array(readMenuImage()),
      );
      expect(defaultCall?.[0]).toBe("https://api.line.me/v2/bot/user/all/richmenu/richmenu-new");
      expect(deleteCall?.[0]).toBe("https://api.line.me/v2/bot/richmenu/richmenu-old");
      expect(deleteCall?.[1].method).toBe("DELETE");
    } finally {
      restore();
    }
  });

  it("real modeのsecret不足とprovider errorを公開処理へ通さない", async () => {
    const restore = setEnvironment({
      LINE_INTEGRATION_MODE: "real",
      LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: undefined,
    });
    try {
      await expect(
        applyLineDefaultRichMenu({
          imageBytes: readMenuImage(),
          fetchImpl: vi.fn(),
        }),
      ).rejects.toThrow("LINE messaging integration is unavailable");
      const fetchImpl = vi.fn().mockResolvedValue(new Response("failure", { status: 500 }));
      const withToken = setEnvironment({ LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: "token" });
      try {
        await expect(
          applyLineDefaultRichMenu({
            imageBytes: readMenuImage(),
            fetchImpl,
          }),
        ).rejects.toThrow("LINE messaging provider rejected the rich menu");
      } finally {
        withToken();
      }
    } finally {
      restore();
    }
  });
});

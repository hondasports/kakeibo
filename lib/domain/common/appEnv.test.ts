import { describe, expect, it } from "vitest";
import { parseKnownAppEnv } from "./appEnv";

describe("parseKnownAppEnv", () => {
  it("development と production だけを完全一致で受け入れる", () => {
    expect(parseKnownAppEnv("development")).toBe("development");
    expect(parseKnownAppEnv("production")).toBe("production");
  });

  it.each([undefined, "", "prod", "Production", "DEVELOPMENT", " production", "preview"])(
    "未設定・未知値（%s）は undefined",
    (value) => {
      expect(parseKnownAppEnv(value)).toBeUndefined();
    },
  );
});

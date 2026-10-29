import { delimiter, join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  envWithConvexNodeRuntime,
  isSupportedForConvexExecutor,
  runtimeRoot,
} from "./ensure-convex-node-runtime.mjs";

describe("isSupportedForConvexExecutor", () => {
  test("local backend が受理する v20/22/24 を true にする", () => {
    expect(isSupportedForConvexExecutor("v20.20.2")).toBe(true);
    expect(isSupportedForConvexExecutor("v22.23.2")).toBe(true);
    expect(isSupportedForConvexExecutor("v24.22.1")).toBe(true);
  });

  test("v26 や欠損値は false にする", () => {
    expect(isSupportedForConvexExecutor("v26.13.0")).toBe(false);
    expect(isSupportedForConvexExecutor("v18.20.0")).toBe(false);
    expect(isSupportedForConvexExecutor("")).toBe(false);
    expect(isSupportedForConvexExecutor("not-a-version")).toBe(false);
  });
});

describe("runtimeRoot", () => {
  test("home 配下の ~/.cache/suzumemo/convex-node-runtime を返す", () => {
    expect(runtimeRoot({ home: "/tmp/home" })).toBe(
      join("/tmp/home", ".cache", "suzumemo", "convex-node-runtime"),
    );
  });
});

describe("envWithConvexNodeRuntime", () => {
  test("runtime が無ければ env をそのまま返す", () => {
    const env = { PATH: "/usr/bin" };
    expect(envWithConvexNodeRuntime(env, null)).toBe(env);
    expect(envWithConvexNodeRuntime(env, undefined)).toBe(env);
    expect(envWithConvexNodeRuntime(env, {})).toBe(env);
  });

  test("runtime の binDir を PATH 先頭に追加する", () => {
    const env = { PATH: "/usr/bin", OTHER: "x" };
    const result = envWithConvexNodeRuntime(env, { binDir: "/opt/node24/bin" });
    expect(result.PATH).toBe(`/opt/node24/bin${delimiter}/usr/bin`);
    expect(result.OTHER).toBe("x");
    expect(env.PATH).toBe("/usr/bin");
  });
});

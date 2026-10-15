// @vitest-environment node
import { createServer, type RequestListener, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { prepareVercelBypassState } from "./vercel-protection";

const servers: Server[] = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function serve(handler: RequestListener) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server address missing");
  return `http://127.0.0.1:${address.port}`;
}

async function statePath() {
  const directory = await mkdtemp(join(tmpdir(), "vercel-bypass-test-"));
  directories.push(directory);
  return join(directory, "state.json");
}

it("bypass secretは対象originへの初回リクエストだけに付け、redirect先へ送らない", async () => {
  let externalRequests = 0;
  const external = await serve((_req, res) => {
    externalRequests++;
    res.end();
  });
  const target = await serve((req, res) => {
    expect(req.headers["x-vercel-protection-bypass"]).toBe("test-secret");
    expect(req.headers["x-vercel-set-bypass-cookie"]).toBe("true");
    res.writeHead(302, {
      location: external,
      "set-cookie": ["_vercel_jwt=test-cookie; Path=/; HttpOnly", "app-session=excluded; Path=/"],
    });
    res.end();
  });
  const path = await statePath();
  await prepareVercelBypassState(target, "test-secret", path);
  const state = JSON.parse(await readFile(path, "utf8"));
  expect(externalRequests).toBe(0);
  expect(state.cookies).toEqual([
    expect.objectContaining({ name: "_vercel_jwt", value: "test-cookie", domain: "127.0.0.1" }),
  ]);
  expect(state.origins).toEqual([]);
  expect(JSON.stringify(state)).not.toContain("test-secret");
  expect(JSON.stringify(state)).not.toContain("app-session");
});

it("保護されたURLの認証失敗はsecretやresponse bodyを含めず停止する", async () => {
  const target = await serve((_req, res) => {
    res.writeHead(401);
    res.end("sensitive-response");
  });
  await expect(prepareVercelBypassState(target, "test-secret", await statePath())).rejects.toThrow(
    "Vercel protection setup failed (401).",
  );
});

it("保護されていない公開URLでは空のstorageStateを保存できる", async () => {
  const target = await serve((_req, res) => res.end("ok"));
  const path = await statePath();
  await prepareVercelBypassState(target, "test-secret", path);
  expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ cookies: [], origins: [] });
});

it("通信失敗時もPlaywrightのheader付きcall logを公開しない", async () => {
  const target = await serve((req) => req.socket.destroy());
  await expect(prepareVercelBypassState(target, "test-secret", await statePath())).rejects.toThrow(
    /^Vercel protection setup request failed\.$/,
  );
});

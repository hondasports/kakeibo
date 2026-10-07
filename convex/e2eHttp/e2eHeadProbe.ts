import { httpAction } from "../_generated/server";
import { isE2eAppEnvironment } from "./e2eAuth";

// #956 AC2 検証用の一時endpoint。CIのE2Eが「PR HEADのconvex関数」を
// 反映したbackendで動くことを実演するためだけに存在し、検証後に削除する。
export const e2eHeadProbeHandler = httpAction(async () => {
  if (!isE2eAppEnvironment()) {
    return new Response(JSON.stringify({ error: "Not enabled" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true, marker: "i956-head-probe" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

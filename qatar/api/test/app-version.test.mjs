// Forced update (NMX-61): a mobile app below MIN_APP_VERSION gets 426 on every call; newer apps and the website
// (no X-HerZone-App header) are not affected.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { versionBelow } from "../src/app.js";
import { buildTemplate, client, startTestEnv } from "./helpers.mjs";

let env, call;
before(async () => {
  buildTemplate();
  env = await startTestEnv({ MIN_APP_VERSION: "1.2.0", APP_STORE_URL: "https://apps.apple.com/app/id000" });
  call = client(env.base);
});
after(async () => { await env.stop(); });

test("version comparison: major.minor.patch, build number ignored, unreadable counts as old", () => {
  assert.equal(versionBelow("1.1.9+40 android", "1.2.0"), true);
  assert.equal(versionBelow("1.2.0+1 ios", "1.2.0"), false);
  assert.equal(versionBelow("1.10.0 android", "1.2.0"), false, "numeric, not text, comparison");
  assert.equal(versionBelow("2.0.0", "1.2.0"), false);
  assert.equal(versionBelow("garbage", "1.2.0"), true);
  assert.equal(versionBelow("1.0.0", ""), false, "no minimum set");
});

test("an old app is told to update, with the right store; a current app and the website are served", async () => {
  const old = await call("GET", "/api/v1/questionnaires/preview", { headers: { "X-HerZone-App": "1.1.0+5 android" } });
  assert.equal(old.status, 426);
  assert.equal(old.body.code, "APP_UPDATE_REQUIRED");
  assert.deepEqual(old.body.details[0], { field: "app_version", code: "BELOW_MINIMUM", min_version: "1.2.0",
    store_url: "https://play.google.com/store/apps/details?id=app.herzone" });
  const oldIos = await call("POST", "/api/v1/auth/otp:request", { headers: { "X-HerZone-App": "1.0.0+1 ios" }, body: { phone_e164: "+97455501234", locale: "ar" } });
  assert.equal(oldIos.status, 426, "sign-in too: nothing works until the update");
  assert.equal(oldIos.body.details[0].store_url, "https://apps.apple.com/app/id000");

  assert.equal((await call("GET", "/api/v1/questionnaires/preview", { headers: { "X-HerZone-App": "1.2.0+9 android" } })).status, 200);
  assert.equal((await call("GET", "/api/v1/questionnaires/preview")).status, 200, "the website sends no version");
});

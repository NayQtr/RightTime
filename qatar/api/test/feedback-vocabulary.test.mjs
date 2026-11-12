// The low-rating reasons and the rating that reveals them are one vocabulary spread over four files, because each
// client shows its own words for the same six keys (api/src/lib/feedback.js explains why none of it is generated).
// This fails as soon as one of them is changed without the others, which is the only link between them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LOW_RATING_REASONS } from "../src/lib/feedback.js";

const QATAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => readFileSync(path.join(QATAR, f), "utf8");
// Every key named in the client's list. The definitions wrap over several lines, so this reads from the marker to the
// statement's closing semicolon rather than one line of it.
const keysOn = (src, marker) => {
  const from = src.indexOf(marker);
  assert.ok(from >= 0, `${marker} not found`);
  const to = src.indexOf(";", from);
  assert.ok(to > from, `${marker} has no end`);
  const body = src.slice(from, to);
  // a key is followed by a comma or a colon, or by the bracket that closes the list when it is the last one
  return [...new Set([...body.matchAll(/["']?\b([a-z_]+)\b["']?\s*[,:\]}]/g)].map((m) => m[1]))]
    .filter((k) => LOW_RATING_REASONS.includes(k));
};

test("the six low-rating reasons are the same in the API, the website, the admin console and the app", () => {
  const web = keysOn(read("web/app.js"), "const LOW_RATING_REASONS = [");
  const admin = keysOn(read("web/admin/admin.js"), "const REASON_LABELS = {");
  const app = keysOn(read("app/lib/ui/meetups/feedback_screen.dart"), "const lowRatingReasons = [");
  for (const [name, got] of [["web/app.js", web], ["web/admin/admin.js", admin], ["feedback_screen.dart", app]]) {
    assert.deepEqual([...got].sort(), [...LOW_RATING_REASONS].sort(), `${name} does not list the same reasons`);
  }
});

test("the rating that reveals the reasons is the same number everywhere", () => {
  const num = (src, re, where) => {
    const m = src.match(re);
    assert.ok(m, `${where}: threshold not found`);
    return Number(m[1]);
  };
  const server = num(read("api/src/lib/config.js"), /get\("LOW_RATING_REASONS_MAX",\s*"(\d+)"\)/, "config.js default");
  assert.equal(num(read("web/app.js"), /const LOW_RATING_REASONS_UP_TO = (\d+);/, "web/app.js"), server);
  assert.equal(num(read("app/lib/ui/meetups/feedback_screen.dart"), /const lowRatingReasonsUpTo = (\d+);/, "feedback_screen.dart"), server);
});

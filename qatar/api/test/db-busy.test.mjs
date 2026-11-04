// A full database (no free connection) answers 503 UNAVAILABLE with Retry-After, not a 500 (NMX-31: a load test filled
// the connection slots and every request failed with INTERNAL).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapPgError } from "../src/lib/http.js";

test("too many connections and 'starting up' map to a retryable 503", () => {
  for (const code of ["53300", "57P03"]) {
    const e = mapPgError(Object.assign(new Error("sorry, too many clients already"), { code }));
    assert.equal(e.status, 503);
    assert.equal(e.code, "UNAVAILABLE");
    assert.equal(e.extra.retry_after, 2);
    assert.deepEqual(e.details, [{ reason: "busy" }], "no server message is passed to the client");
  }
  assert.equal(mapPgError(Object.assign(new Error("x"), { code: "42601" })), null, "other errors stay 500");
});

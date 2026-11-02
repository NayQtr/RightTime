// Truncated client IP stored with sign-in codes, consents and admin sign-in attempts (no full IP is kept): IPv4 keeps
// its /24, IPv6 its /48. Compressed IPv6 ("::") once produced invalid values such as "2001:db8:::/48", which made the
// database reject the request (a server error for members on IPv6 networks).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ipTrunc } from "../src/lib/http.js";

test("IPv4 keeps its /24; IPv4-mapped IPv6 is treated as IPv4", () => {
  assert.equal(ipTrunc("203.0.113.7"), "203.0.113.0/24");
  assert.equal(ipTrunc("::ffff:203.0.113.7"), "203.0.113.0/24");
});

test("IPv6 keeps its /48, compressed or not", () => {
  assert.equal(ipTrunc("2001:db8:85a3:8d3:1319:8a2e:370:7348"), "2001:db8:85a3::/48");
  assert.equal(ipTrunc("2001:db8::1"), "2001:db8:0::/48");
  assert.equal(ipTrunc("2001:0db8:0000:0000::1"), "2001:db8:0::/48");
  assert.equal(ipTrunc("::1"), "0:0:0::/48");
  assert.equal(ipTrunc("fe80::"), "fe80:0:0::/48");
  assert.equal(ipTrunc("[2001:db8::1]"), "2001:db8:0::/48");
  assert.equal(ipTrunc("fe80::1%eth0"), "fe80:0:0::/48");
});

test("anything else is not an IP", () => {
  for (const s of ["", "garbage", "1:2:3:4:5:6:7:8:9", "2001:db8:::1", "300.1.1.1", "g::1", null, undefined]) assert.equal(ipTrunc(s), null, String(s));
});

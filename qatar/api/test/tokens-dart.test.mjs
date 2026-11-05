// The Flutter tokens (qatar/design/flutter/herzone_tokens.dart) match the design source (qatar/design/tokens.json), which
// the website's tokens.css is also built from: same colour for every role in both themes, same spacing, radii and type.
// Regenerate with: python3 qatar/design/build_tokens_dart.py
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tokens = JSON.parse(readFileSync(new URL("../../design/tokens.json", import.meta.url), "utf8"));
const dart = readFileSync(new URL("../../design/flutter/herzone_tokens.dart", import.meta.url), "utf8");
const flutterColor = (hex) => {
  const h = hex.slice(1).toUpperCase();
  return h.length === 6 ? `Color(0xFF${h})` : `Color(0x${h.slice(6)}${h.slice(0, 6)})`;
};
const num = (v) => { const f = Number(String(v).replace("px", "")); return Number.isInteger(f) ? f.toFixed(1) : String(f); };

test("every colour role has the same value in Flutter, in light and dark", () => {
  for (const theme of ["light", "dark"]) {
    const line = dart.split("\n").find((l) => l.includes(`static const ${theme} = HzColors(`));
    assert.ok(line, `${theme} colours`);
    for (const [role, v] of Object.entries(tokens.color[theme])) {
      assert.ok(line.includes(`${role}: ${flutterColor(v.$value)}`), `${theme}.${role} = ${v.$value}`);
    }
  }
});

test("spacing, radii and text sizes match", () => {
  for (const [k, v] of Object.entries(tokens.space)) if (!k.startsWith("$")) {
    assert.ok(dart.includes(`static const double ${/^[A-Za-z]/.test(k) ? k : "s" + k} = ${num(v.$value)};`), `space.${k}`);
  }
  for (const [k, v] of Object.entries(tokens.radius)) if (!k.startsWith("$")) assert.ok(dart.includes(`static const double ${k} = ${num(v.$value)};`), `radius.${k}`);
  for (const lang of ["ar", "en"]) for (const [role, v] of Object.entries(tokens.type[lang])) {
    const name = `${lang}${role[0].toUpperCase()}${role.slice(1)}`;
    const line = dart.split("\n").find((l) => l.includes(`TextStyle ${name} =`));
    assert.ok(line && line.includes(`fontSize: ${num(v.$value.fontSize)}`) && line.includes(`height: ${num(v.$value.lineHeight)}`), `type.${lang}.${role}`);
  }
});

test("the Flutter app uses exactly the generated tokens file", () => {
  const app = readFileSync(new URL("../../app/lib/design/herzone_tokens.dart", import.meta.url), "utf8");
  assert.equal(app, dart, "run python3 qatar/design/build_tokens_dart.py");
});

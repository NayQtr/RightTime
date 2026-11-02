// Writes openapi/openapi.json from openapi/spec.mjs. Run: node openapi/build.mjs
import { writeFileSync } from "node:fs";
import { spec } from "./spec.mjs";

const out = new URL("./openapi.json", import.meta.url);
writeFileSync(out, JSON.stringify(spec, null, 2) + "\n");
console.log(`wrote ${out.pathname}: ${Object.keys(spec.paths).length} paths`);

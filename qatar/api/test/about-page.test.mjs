// W1 public page (/about, /about/en; design phase 7): built from approved texts, light images, indexable on its own
// while every booking page stays out of search results, and kept out of the app's offline copy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { CLOSING, GALLERY, HERO, OG_IMAGE, OUTPUTS, PAGES, SITE, aboutPage } from "../../ops/build-about-page.mjs";

const WEB = new URL("../../web/", import.meta.url);
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{23F0}-\u{23FF}]/u;
const pages = { ar: readFileSync(OUTPUTS.ar, "utf8"), en: readFileSync(OUTPUTS.en, "utf8") };

test("about: the committed pages are what the generator builds from web/strings.js (run node qatar/ops/build-about-page.mjs)", () => {
  for (const lang of ["ar", "en"]) assert.equal(pages[lang], aboutPage(lang), `web/about/${lang === "ar" ? "index" : "en"}.html is out of date`);
});

test("about: language, one h1, both calls to the app, the sections in order, no emoji", () => {
  for (const [lang, html] of Object.entries(pages)) {
    assert.match(html, new RegExp(`<html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}">`));
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
    assert.equal((html.match(/class="btn btn-primary" id="cta-(top|bottom)" href="\/" data-locale="/g) || []).length, 2);
    const order = ["hero-title", "how-title", "safety-title", "venues-title", "refund-title", "faq-title", "closing-title"].map((id) => html.indexOf(`id="${id}"`));
    assert.ok(order.every((p, i) => p > 0 && (i === 0 || p > order[i - 1])), `sections out of order: ${order}`);
    assert.equal((html.match(/<details>/g) || []).length, 4);
    assert.ok(!EMOJI.test(html), "no emoji");
  }
});

test("about: basic SEO (title, description, canonical, hreflang ar/en/x-default, Open Graph), never noindex", () => {
  for (const [lang, html] of Object.entries(pages)) {
    assert.match(html, /<title>HerZone · [^<]+<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]{20,}">/);
    assert.ok(html.includes(`<link rel="canonical" href="${SITE}${PAGES[lang]}">`));
    for (const [hl, p] of [["ar", PAGES.ar], ["en", PAGES.en], ["x-default", PAGES.ar]]) assert.ok(html.includes(`<link rel="alternate" hreflang="${hl}" href="${SITE}${p}">`), hl);
    for (const p of ["og:type", "og:title", "og:description", "og:url", "og:image", "og:locale"]) assert.ok(html.includes(`property="${p}"`), p);
    assert.ok(!/noindex/.test(html));
  }
});

test("about: every photo is WebP with a JPEG fallback, has width and height, at most 250 KB; only the first is not lazy", () => {
  const files = [...[HERO, ...GALLERY, CLOSING].flatMap(({ name, sizes }) => sizes.flatMap(([w]) => [`${name}-${w}.webp`, `${name}-${w}.jpg`])), OG_IMAGE.file];
  for (const f of files) {
    const size = statSync(new URL(`about/img/${f}`, WEB)).size;
    assert.ok(size > 1000 && size <= 250 * 1024, `${f}: ${size} bytes`);
  }
  for (const html of Object.values(pages)) {
    const pics = [...html.matchAll(/<picture[^>]*>([\s\S]*?)<\/picture>/g)].map((m) => m[1]);
    assert.equal(pics.length, 1 + GALLERY.length + 1);
    pics.forEach((p, i) => {
      assert.match(p, /<source type="image\/webp" srcset="[^"]+\.webp \d+w/);
      assert.match(p, /<img src="\/about\/img\/[\w-]+\.jpg" srcset="[^"]+" sizes="[^"]+" width="\d+" height="\d+" alt=""/);
      if (i === 0) assert.match(p, /fetchpriority="high"/); else assert.match(p, /loading="lazy"/);
      for (const m of p.matchAll(/\/about\/img\/([\w-]+\.(?:webp|jpg))/g)) assert.ok(files.includes(m[1]), m[1]);
    });
  }
});

test("about: works under the site's CSP (no inline script, style or handler) and uses only token colours", () => {
  for (const html of Object.values(pages)) {
    for (const m of html.matchAll(/<script\b([^>]*)>/g)) assert.match(m[1], /\ssrc="\/[^"]+"/, "every script is a file");
    assert.ok(!/<style\b|\sstyle="|\son[a-z]+="/i.test(html), "no inline style or event handler");
  }
  const css = readFileSync(new URL("about/about.css", WEB), "utf8");
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i.test(css.replace(/\/\*[\s\S]*?\*\//g, "")), "colours come from tokens.css only");
});

test("vercel.json: /about and /about/en are served, only they may be indexed; every page keeps the security headers", () => {
  const v = JSON.parse(readFileSync(new URL("vercel.json", WEB), "utf8"));
  assert.deepEqual(v.rewrites.filter((r) => r.source.startsWith("/about")), [{ source: "/about", destination: "/about/index.html" }, { source: "/about/en", destination: "/about/en.html" }]);
  const rule = (key) => v.headers.filter((h) => h.headers.some((x) => x.key === key)).map((h) => new RegExp(`^${h.source}$`));
  const noindex = rule("X-Robots-Tag"), csp = rule("Content-Security-Policy");
  for (const p of ["/", "/admin", "/admin/index.html", "/venue", "/delete-account", "/checkout/mock/b1", "/app.js", "/sw.js"]) assert.ok(noindex.some((r) => r.test(p)), `${p} stays noindex`);
  for (const p of ["/about", "/about/en", "/about/index.html", "/about/img/hero-960.webp"]) assert.ok(!noindex.some((r) => r.test(p)), `${p} may be indexed`);
  for (const p of ["/", "/about", "/about/en", "/admin"]) assert.ok(csp.some((r) => r.test(p)), `${p} keeps the CSP`);
});

test("service worker: the public page stays out of the app's offline copy", () => {
  const sw = readFileSync(new URL("sw.js", WEB), "utf8");
  assert.match(sw, /url\.pathname\.startsWith\("\/about"\)\) return;/);
  assert.ok(!/"\/about/.test(sw.match(/const CORE = (\[[\s\S]*?\]);/)[1]));
});

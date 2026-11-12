// W1 (design phase 7): the public marketing page, in Arabic (/about) and English (/about/en), separate from the member
// app so booking is untouched. Static HTML (readable by search engines and link previews, no script needed), built
// from the website's approved texts (web/strings.js), its icons and its logo, so a text changed there changes here too.
// Usage: node qatar/ops/build-about-page.mjs   (writes web/about/index.html and web/about/en.html; a test checks they
// are up to date)
//
// PROVISIONAL (owner review, 10 Nov): the sections, their order and the photos below are one obvious place to change.
// Every line is an existing approved string (no new copy). Photos: the round-3 set without photo 4 (restaurant table)
// and photo 6 (terrace), owner decision 10 Nov.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STRINGS } from "../web/strings.js";
import { icon } from "../web/icons.js";
import { brandMark } from "../web/motif.js";

/** The browser chrome colour of the generated pages. It is written out because a meta tag cannot read a CSS variable,
 *  so it is read from the design source rather than typed, and cannot drift from the palette. */
const THEME = (() => {
  const c = JSON.parse(readFileSync(new URL("../design/tokens.json", import.meta.url), "utf8")).color;
  return { light: c.light.bg.$value, dark: c.dark.bg.$value };
})();

/** The public address used in canonical, hreflang and Open Graph links. */
export const SITE = "https://herzone.app";
export const PAGES = { ar: "/about", en: "/about/en" };
/** Where both calls to action go: the member app's welcome screen (it starts the questions). */
export const CTA_HREF = "/";

const IMG = "/about/img";
// [name, width, height]; every file exists as .webp and .jpg (each at most 250 KB, see test/about-page.test.mjs)
export const HERO = { name: "hero", sizes: [[960, 540], [1600, 900]] };
export const GALLERY = ["barista", "cake", "tray", "toast"].map((name) => ({ name, sizes: [[720, 900]] }));
export const CLOSING = { name: "seat", sizes: [[720, 900]] };
export const OG_IMAGE = { file: "og-1200.jpg", width: 1200, height: 630 };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// alt="": the photos set the mood (they are not of a named venue); every point is in the text next to them.
function picture({ name, sizes }, { sizesAttr, eager = false, cls = "about-photo" }) {
  const set = (ext) => sizes.map(([w]) => `${IMG}/${name}-${w}.${ext} ${w}w`).join(", ");
  const [w, h] = sizes[0];
  const load = eager ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"';
  return `<picture class="${cls}"><source type="image/webp" srcset="${set("webp")}" sizes="${sizesAttr}">`
    + `<img src="${IMG}/${name}-${w}.jpg" srcset="${set("jpg")}" sizes="${sizesAttr}" width="${w}" height="${h}" alt="" ${load}></picture>`;
}

export function aboutPage(lang) {
  const S = STRINGS[lang];
  const T = (k) => {
    if (typeof S[k] !== "string") throw new Error(`missing text ${lang}.${k}`);
    return S[k];
  };
  const other = lang === "ar" ? "en" : "ar";
  const url = SITE + PAGES[lang];
  const hero = esc(T("welcomeHero")).replace(/^(.+?)\s*\{em\}/, (_, lead) => `<span class="lead-in">${lead}</span> <em>${esc(T("welcomeHeroEm"))}</em>`);
  const cta = (id) => `<a class="btn btn-primary" id="${id}" href="${CTA_HREF}" data-locale="${lang}">${esc(T("getStarted"))}</a>`;
  const title = `HerZone · ${T("welcomeHeroPlain")}`;
  return `<!doctype html>
<html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="${THEME.light}" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="${THEME.dark}" media="(prefers-color-scheme: dark)">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(T("welcomeSub"))}">
  <link rel="canonical" href="${url}">
  <link rel="alternate" hreflang="ar" href="${SITE + PAGES.ar}">
  <link rel="alternate" hreflang="en" href="${SITE + PAGES.en}">
  <link rel="alternate" hreflang="x-default" href="${SITE + PAGES.ar}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="HerZone">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(T("welcomeSub"))}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE}${IMG}/${OG_IMAGE.file}">
  <meta property="og:image:width" content="${OG_IMAGE.width}">
  <meta property="og:image:height" content="${OG_IMAGE.height}">
  <meta property="og:locale" content="${lang === "ar" ? "ar_QA" : "en_GB"}">
  <meta property="og:locale:alternate" content="${lang === "ar" ? "en_GB" : "ar_QA"}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
  <link rel="preload" href="/fonts/alexandria-arabic-800-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/fonts/fonts.css">
  <script src="/theme-init.js"></script>
  <link rel="stylesheet" href="/tokens.css">
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/about/about.css">
  <script src="/about/about.js" defer></script>
</head>
<body class="about">
  <a class="skip" href="#main">${esc(T("skip"))}</a>
  <header class="topbar">
    <a class="brand" href="${PAGES[lang]}">${brandMark()}<span class="brand-name">${esc(T("brand"))}</span></a>
    <span class="spacer"></span>
    <a class="btn btn-ghost" id="lang" href="${PAGES[other]}" hreflang="${other}" lang="${other}">${esc(T("langToggle"))}</a>
  </header>
  <main id="main" tabindex="-1">
    <section class="about-hero" aria-labelledby="hero-title">
      <div class="about-hero-text">
        <h1 id="hero-title">${hero}</h1>
        <p>${esc(T("welcomeSub"))}</p>
        ${cta("cta-top")}
      </div>
      ${picture(HERO, { sizesAttr: "(min-width: 1024px) 480px, 100vw", eager: true })}
    </section>

    <section aria-labelledby="how-title">
      <h2 id="how-title">${esc(T("howTitle"))}</h2>
      <ol class="steps">${["how1", "how2", "how3", "how4"].map((k, j) => `<li><span class="n" aria-hidden="true">${j + 1}</span><span>${esc(T(k))}</span></li>`).join("")}</ol>
    </section>

    <section aria-labelledby="safety-title">
      <h2 id="safety-title">${esc(T("safetyTitle"))}</h2>
      <ul class="benefits">${["safe1", "safe2", "safe3", "safe4"].map((k) => `<li><span class="bi">${icon("check")}</span><span>${esc(T(k))}</span></li>`).join("")}</ul>
    </section>

    <section aria-labelledby="venues-title">
      <h2 id="venues-title">${esc(T("wyg2t"))}</h2>
      <p class="lead">${esc(T("wyg2b"))}</p>
      <ul class="about-gallery">${GALLERY.map((g) => `<li>${picture(g, { sizesAttr: "(min-width: 1024px) 240px, 50vw" })}</li>`).join("")}</ul>
    </section>

    <section aria-labelledby="refund-title">
      <h2 id="refund-title">${esc(T("refundLabel"))}</h2>
      <div class="banner banner-info"><span class="icon">${icon("info")}</span><div>${esc(T("wygRefundGeneric"))}</div></div>
      <p class="caption">${esc(T("wygPriceNoFee"))}</p>
    </section>

    <section aria-labelledby="faq-title">
      <h2 id="faq-title">${esc(T("faqTitle"))}</h2>
      <div class="faq">${[1, 2, 3, 4].map((k) => `<details><summary>${esc(T(`faq${k}q`))}</summary><p class="muted">${esc(T(`faq${k}a`))}</p></details>`).join("")}</div>
    </section>

    <section class="about-closing" aria-labelledby="closing-title">
      ${picture(CLOSING, { sizesAttr: "(min-width: 1024px) 320px, 100vw" })}
      <div class="about-closing-text">
        <h2 id="closing-title">${esc(T("bookSeat"))}</h2>
        <p class="lead">${esc(T("welcomeSub"))}</p>
        ${cta("cta-bottom")}
      </div>
    </section>
  </main>
  <footer class="about-foot"><p>${esc(T("womenOnly"))} · ${esc(T("cityFull"))}</p></footer>
</body>
</html>
`;
}

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web");
export const OUTPUTS = { ar: path.join(WEB, "about", "index.html"), en: path.join(WEB, "about", "en.html") };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const lang of ["ar", "en"]) writeFileSync(OUTPUTS[lang], aboutPage(lang));
  console.log("about: wrote", Object.values(OUTPUTS).map((f) => path.relative(process.cwd(), f)).join(", "));
}

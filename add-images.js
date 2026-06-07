/* Injects a themed lead image into each article page (idempotent).
   Run after build.js / whenever article HTML is regenerated:  node add-images.js */
const fs = require("fs");
const path = require("path");
const ROOT = __dirname;

const IMG = {
  ban: {
    src: "assets/img/outreach-without-ban.webp",
    w: 1400, h: 781,
    alt: "LinkedIn outreach without the account ban — a banned profile beside a safe, managed BriskReach account",
  },
  inbox: {
    src: "assets/img/briskreach-inbox.webp",
    w: 1400, h: 788,
    alt: "BriskReach unified inbox showing LinkedIn conversations, contact details, and reply tracking",
  },
  network: {
    src: "assets/img/outreach-network.webp",
    w: 1400, h: 788,
    alt: "Illustration of a B2B LinkedIn outreach network connecting prospects, messages, and analytics",
  },
};

// theme assignment
const BAN = new Set([
  "briskreach-linkedin-outreach-article",
  "linkedin-outreach-banned-briskreach-2026",
  "linkedin-automation-banned-2026-article",
  "linkedin-account-restricted-automation-article",
  "linkedin-outreach-without-restriction-article",
]);
const INBOX = new Set([
  "briskreach-review-article",
  "briskreach-vs-akountify-article",
]);

function themeFor(slug) {
  if (BAN.has(slug)) return IMG.ban;
  if (INBOX.has(slug)) return IMG.inbox;
  return IMG.network; // default
}

const anchor = `  </header>\n\n  <div class="container">\n    <div class="prose">`;

let done = 0, skipped = 0;
for (const file of fs.readdirSync(ROOT)) {
  if (!file.endsWith(".html")) continue;
  if (["index.html", "articles.html", "favicon-template.html", "og-template.html"].includes(file)) continue;

  const fp = path.join(ROOT, file);
  let html = fs.readFileSync(fp, "utf8");
  if (html.includes("article-figure")) { skipped++; continue; }      // idempotent
  if (!html.includes(anchor)) { console.log("  ! no anchor:", file); continue; }

  const img = themeFor(file.replace(/\.html$/, ""));
  const fig = `  </header>\n\n  <div class="container">\n    <figure class="article-figure">\n      <img src="${img.src}" alt="${img.alt}" width="${img.w}" height="${img.h}" fetchpriority="high" decoding="async">\n    </figure>\n    <div class="prose">`;
  html = html.replace(anchor, fig);
  fs.writeFileSync(fp, html);
  done++;
}
console.log(`\n✓ Lead images injected into ${done} pages (${skipped} already had one).`);

/* ─────────────────────────────────────────────────────────
   outreachbench_ static blog builder
   Converts every *-article.md (+ playbook) into a styled
   HTML page and generates articles.html (the blog index).
   Run:  node build.js
   ───────────────────────────────────────────────────────── */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const SITE = "https://outreachbench.github.io/outreachbench";
const AUTHOR = "Marcus R.";
const PUBLISHED = "2026-02-01";
const MODIFIED = "2026-05-10";

// Files that are NOT blog articles.
const EXCLUDE = new Set(["facebook-post-promo.md"]);

/* ── tiny helpers ─────────────────────────────────────────── */
const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeAttr = (s) => escapeHtml(s).replace(/"/g, "&quot;");

// Inline markdown -> HTML. Input is a raw markdown fragment.
function inline(text) {
  let t = escapeHtml(text);
  // inline code first so its contents are not re-parsed
  t = t.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  // bold
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // links  [label](url)
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const isExternal = /^https?:\/\//i.test(url);
    const rel = isExternal ? ' target="_blank" rel="noopener"' : "";
    return `<a href="${escapeAttr(url)}"${rel}>${label}</a>`;
  });
  return t;
}

// Rewrite internal "*.md" links to "*.html"
function rewriteInternalLinks(md) {
  return md.replace(/\]\(([^)]+?)\.md(#[^)]*)?\)/g, (m, file, hash) => {
    if (/^https?:\/\//i.test(file)) return m; // leave absolute URLs alone
    return `](${file}.html${hash || ""})`;
  });
}

const isTableSep = (line) =>
  /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);

const splitRow = (line) =>
  line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());

/* ── block-level markdown -> HTML ─────────────────────────── */
function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  let para = [];

  const flushPara = () => {
    if (para.length) {
      // source never soft-wraps real prose, so consecutive lines are
      // intentional breaks (e.g. "Best for: / Pricing: / Website:")
      out.push(`<p>${para.map(inline).join("<br>")}</p>`);
      para = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // blank line
    if (trimmed === "") { flushPara(); i++; continue; }

    // horizontal rule
    if (/^---+$/.test(trimmed)) { flushPara(); out.push("<hr>"); i++; continue; }

    // headings
    const h = trimmed.match(/^(#{2,4})\s+(.*)$/);
    if (h) {
      flushPara();
      const level = h[1].length; // 2,3,4
      const id = h[2].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      out.push(`<h${level} id="${id}">${inline(h[2])}</h${level}>`);
      i++; continue;
    }

    // table  (header row followed by separator row)
    if (/^\s*\|.*\|/.test(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushPara();
      const header = splitRow(line);
      i += 2; // skip header + separator
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|/.test(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      let tbl = '<div class="table-wrap"><table><thead><tr>';
      header.forEach((c) => (tbl += `<th>${inline(c)}</th>`));
      tbl += "</tr></thead><tbody>";
      rows.forEach((r) => {
        tbl += "<tr>";
        r.forEach((c) => (tbl += `<td>${inline(c)}</td>`));
        tbl += "</tr>";
      });
      tbl += "</tbody></table></div>";
      out.push(tbl);
      continue;
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      out.push("<ul>" + items.map((it) => `<li>${inline(it)}</li>`).join("") + "</ul>");
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara();
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      out.push("<ol>" + items.map((it) => `<li>${inline(it)}</li>`).join("") + "</ol>");
      continue;
    }

    // default: paragraph text
    para.push(trimmed);
    i++;
  }
  flushPara();
  return out.join("\n");
}

/* ── parse one article file ───────────────────────────────── */
function parseArticle(file) {
  let raw = fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");

  // strip trailing "SEO Keywords" section (internal notes — never publish)
  raw = raw.replace(/\n#{1,4}\s*SEO Keywords[\s\S]*$/i, "\n");
  raw = raw.replace(/\n\*\*Keywords targeted:\*\*[\s\S]*$/i, "\n");

  // title = first H1
  const titleMatch = raw.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : file.replace(/\.md$/, "");
  // body = everything after the H1 line
  let body = titleMatch ? raw.slice(raw.indexOf(titleMatch[0]) + titleMatch[0].length) : raw;

  body = rewriteInternalLinks(body);

  // excerpt = first real paragraph, stripped of markdown
  let excerpt = "";
  for (const block of body.split(/\n\s*\n/)) {
    const t = block.trim();
    if (!t || t.startsWith("#") || t.startsWith("|") || /^[-*]\s/.test(t) || /^\d+\.\s/.test(t) || /^---+$/.test(t)) continue;
    excerpt = t.replace(/\n/g, " ");
    break;
  }
  excerpt = excerpt
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const metaDesc = excerpt.length > 155 ? excerpt.slice(0, 152).replace(/\s+\S*$/, "") + "…" : excerpt;
  const cardDesc = excerpt.length > 170 ? excerpt.slice(0, 167).replace(/\s+\S*$/, "") + "…" : excerpt;

  const html = mdToHtml(body);
  const slug = file.replace(/\.md$/, "");
  return { file, slug, title, metaDesc, cardDesc, html };
}

/* ── shared chrome ────────────────────────────────────────── */
const NAV = `<nav>
  <div class="nav-inner">
    <a href="index.html" class="nav-logo">outreachbench<em>_</em></a>
    <ul class="nav-links">
      <li><a href="index.html#results">Benchmark</a></li>
      <li><a href="index.html#methodology">Methodology</a></li>
      <li><a href="articles.html">Guides</a></li>
      <li><a href="https://www.briskreach.com" target="_blank" rel="noopener" class="nav-cta">Try BriskReach ↗</a></li>
    </ul>
  </div>
</nav>`;

const FOOTER = `<footer>
  <div class="container-wide">
    <div class="footer-bottom">
      <span>© 2026 outreachbench_. Independent research, no vendor sponsorship.</span>
      <span>
        <a href="index.html">Benchmark</a> &nbsp;·&nbsp;
        <a href="articles.html">Guides</a> &nbsp;·&nbsp;
        <a href="https://www.briskreach.com" target="_blank" rel="noopener">BriskReach</a>
      </span>
    </div>
  </div>
</footer>`;

const HEAD_COMMON = (title, desc, canonical, ogType) => `  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeAttr(title)} | outreachbench_</title>
  <meta name="description" content="${escapeAttr(desc)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${escapeAttr(title)}">
  <meta property="og:description" content="${escapeAttr(desc)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:site_name" content="outreachbench_">
  <meta property="og:image" content="${SITE}/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeAttr(title)}">
  <meta name="twitter:description" content="${escapeAttr(desc)}">
  <meta name="twitter:image" content="${SITE}/og.png">
  <link rel="icon" type="image/png" sizes="512x512" href="favicon-512.png">
  <link rel="apple-touch-icon" href="favicon-512.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="assets/article.css">`;

/* ── render a single article page ─────────────────────────── */
function renderArticle(a, canonicalOverride) {
  const canonical = canonicalOverride || `${SITE}/${a.slug}.html`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title.length > 110 ? a.title.slice(0, 110) : a.title,
    image: `${SITE}/og.png`,
    author: { "@type": "Person", name: AUTHOR },
    datePublished: PUBLISHED,
    dateModified: MODIFIED,
    publisher: {
      "@type": "Organization",
      name: "outreachbench_",
      url: SITE,
      logo: { "@type": "ImageObject", url: `${SITE}/favicon-512.png`, width: 512, height: 512 },
    },
    description: a.metaDesc,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE}/${a.slug}.html` },
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE}/articles.html` },
      { "@type": "ListItem", position: 3, name: a.title, item: `${SITE}/${a.slug}.html` },
    ],
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
${HEAD_COMMON(a.title, a.metaDesc, canonical, "article")}
  <script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
  </script>
  <script type="application/ld+json">
${JSON.stringify(breadcrumb, null, 2)}
  </script>
</head>
<body>

${NAV}

<main>
<article>
  <header class="article-head">
    <div class="container">
      <a href="articles.html" class="crumb">← All guides</a>
      <div class="eyebrow">LinkedIn Outreach Guide</div>
      <h1>${inline(a.title)}</h1>
      <div class="byline">
        <span class="avatar">MR</span>
        <span><strong>${AUTHOR}</strong><span class="sep"> · </span>outreachbench_<span class="sep"> · </span>Updated May 2026</span>
      </div>
    </div>
  </header>

  <div class="container">
    <div class="prose">
${a.html}

      <div class="cta-block">
        <div class="cta-block-copy">
          <div class="cta-block-headline">Run LinkedIn outreach that actually replies</div>
          <div class="cta-block-sub">BriskReach offers a platform for renting and managing LinkedIn accounts, plus a conservative safety engine for your own account. No automation bots, no ban risk.</div>
        </div>
        <a href="https://www.briskreach.com/auth/sign-up" target="_blank" rel="noopener" class="cta-btn">Try BriskReach free →</a>
      </div>
    </div>
  </div>
</article>
</main>

${FOOTER}

</body>
</html>
`;
}

/* ── render the blog index ────────────────────────────────── */
function renderIndex(articles) {
  const canonical = `${SITE}/articles.html`;
  const cards = articles
    .map(
      (a) => `      <a href="${a.slug}.html" class="post-card">
        <div class="pc-eyebrow">Guide</div>
        <h2>${escapeHtml(a.title)}</h2>
        <p>${escapeHtml(a.cardDesc)}</p>
        <span class="pc-more">Read guide →</span>
      </a>`
    )
    .join("\n");

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "outreachbench_ LinkedIn Outreach Guides",
    numberOfItems: articles.length,
    itemListElement: articles.map((a, n) => ({
      "@type": "ListItem",
      position: n + 1,
      url: `${SITE}/${a.slug}.html`,
      name: a.title,
    })),
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
${HEAD_COMMON(
    "LinkedIn Outreach Guides & Tool Reviews",
    "In-depth guides, tool comparisons, and reviews on safe LinkedIn outreach in 2026 — automation risk, account safety, reply rates, and the managed-account model.",
    canonical,
    "website"
  )}
  <script type="application/ld+json">
${JSON.stringify(itemList, null, 2)}
  </script>
</head>
<body>

${NAV}

<main>
  <section class="blog-hero">
    <div class="container-wide">
      <h1>LinkedIn Outreach Guides &amp; Tool Reviews</h1>
      <p>In-depth analysis of LinkedIn outreach tools, account-safety mechanics, and the strategies that actually generate replies in 2026 — backed by the same testing behind our benchmark.</p>
    </div>
  </section>

  <div class="container-wide">
    <div class="blog-section-label">All Guides · ${articles.length} articles</div>
    <div class="card-grid">
${cards}
    </div>
  </div>
</main>

${FOOTER}

</body>
</html>
`;
}

/* ── run ──────────────────────────────────────────────────── */
const files = fs
  .readdirSync(ROOT)
  .filter((f) => f.endsWith(".md") && !EXCLUDE.has(f))
  .sort();

const parsed = files.map(parseArticle);

// duplicate-title detection -> canonical the later one to the first
const seenTitle = new Map();
let written = 0;
for (const a of parsed) {
  const key = a.title.toLowerCase().trim();
  let canonicalOverride = null;
  if (seenTitle.has(key)) {
    canonicalOverride = `${SITE}/${seenTitle.get(key)}.html`;
    console.log(`  ! duplicate title — canonical "${a.slug}" -> "${seenTitle.get(key)}"`);
  } else {
    seenTitle.set(key, a.slug);
  }
  fs.writeFileSync(path.join(ROOT, `${a.slug}.html`), renderArticle(a, canonicalOverride));
  written++;
}

fs.writeFileSync(path.join(ROOT, "articles.html"), renderIndex(parsed));

console.log(`\n✓ Built ${written} article pages + articles.html`);
parsed.forEach((a) => console.log(`  - ${a.slug}.html  «${a.title.slice(0, 60)}»`));

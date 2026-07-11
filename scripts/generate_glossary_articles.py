#!/usr/bin/env python3
"""Generate full SEO glossary articles for WordsThatSells (sidebar "Read full article" targets)."""
from __future__ import annotations

import html
import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED = json.loads((ROOT / "wts-admin/database/glossary_seed_data.json").read_text())
OUT = ROOT / "en/resources/glossary"

# Footer extracted from existing glossary pages (FA + styles + footer markup)
FOOTER_CANDIDATE = Path("/tmp/wts-glossary-footer.html")
if FOOTER_CANDIDATE.exists():
    FOOTER_SRC = FOOTER_CANDIDATE.read_text()
else:
    # minimal fallback
    FOOTER_SRC = "</body></html>"


def esc(s: str) -> str:
    return html.escape(s or "", quote=True)


def esc_text(s: str) -> str:
    return html.escape(s or "")


term_to_file: dict[str, str] = {}
for t in SEED:
    link = t.get("article_link") or ""
    if "/glossary/" in link:
        term_to_file[t["term"]] = link.rstrip("/").split("/")[-1]


def related_link(name: str) -> str:
    name = name.strip()
    for t in SEED:
        if t["term"].lower() == name.lower():
            fn = term_to_file.get(t["term"])
            if fn:
                return f'<a href="/en/resources/glossary/{fn}">{esc_text(t["term"])}</a>'
    for t in SEED:
        if name.lower() in t["term"].lower() or t["term"].lower() in name.lower():
            fn = term_to_file.get(t["term"])
            if fn:
                return f'<a href="/en/resources/glossary/{fn}">{esc_text(t["term"])}</a>'
    return esc_text(name)


def bullets_html(bullets: list) -> str:
    if not bullets:
        bullets = [
            "Improves crawl clarity for search engines",
            "Supports ranking relevance for target keywords",
            "Helps users and bots find the right page",
        ]
    items = "\n".join(f"      <li>{esc_text(b)}</li>" for b in bullets)
    return f"<ul>\n{items}\n    </ul>"


def related_html(related: list) -> str:
    if not related:
        return '<p>Explore more terms in the <a href="/en/resources/glossary/">SEO glossary</a>.</p>'
    items = "\n".join(f"      <li>{related_link(r)}</li>" for r in related)
    return f'<ul class="related-terms">\n{items}\n    </ul>'


def footer_for(filename: str) -> str:
    f = FOOTER_SRC
    f = re.sub(r"/en/resources/glossary/[^\"']+\.html", f"/en/resources/glossary/{filename}", f)
    f = re.sub(r"/la/resources/glossary/[^\"']+\.html", f"/la/resources/glossary/{filename}", f)
    f = re.sub(r"/fr/resources/glossary/[^\"']+\.html", f"/fr/resources/glossary/{filename}", f)
    f = re.sub(r"/th/resources/glossary/[^\"']+\.html", f"/th/resources/glossary/{filename}", f)
    return f


CSS = """
:root { --primary:#2c3e50; --accent:#2980b9; --bg:#fff; --text:#333; --text-light:#555; --surface:#f8f9fa; --border-radius:8px; }
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Poppins','Segoe UI',Helvetica,Arial,sans-serif;color:var(--text);background:var(--bg);line-height:1.75;font-size:17px}
.container{max-width:900px;margin:0 auto;padding:0 20px}
.back-link{display:inline-flex;align-items:center;gap:8px;color:var(--accent);font-weight:600;margin:32px 0 24px;text-decoration:none}
.back-link:hover{color:var(--primary)}
.article-header{text-align:center;margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid #e0e0e0}
.article-category{display:inline-block;background:linear-gradient(135deg,var(--accent),#3498db);color:#fff;padding:6px 16px;border-radius:20px;font-size:.85rem;font-weight:600;margin-bottom:16px;text-transform:uppercase;letter-spacing:.5px}
h1{font-size:2.1rem;color:var(--primary);line-height:1.3;margin-bottom:16px;font-weight:700}
.article-meta{display:flex;flex-wrap:wrap;justify-content:center;gap:16px;color:var(--text-light);font-size:.9rem}
.featured-image-wrapper{margin:0 0 32px;overflow:hidden;border-radius:var(--border-radius)}
.featured-image{width:100%;height:auto;display:block;object-fit:cover}
h2{font-size:1.5rem;color:var(--primary);margin:40px 0 16px;padding-bottom:10px;border-bottom:3px solid var(--accent);font-weight:700}
h3{font-size:1.2rem;color:var(--primary);margin:28px 0 12px;font-weight:600}
p{margin-bottom:18px}
a{color:var(--accent);text-decoration:none}
a:hover{color:var(--primary);text-decoration:underline}
ul,ol{margin:0 0 20px 1.4rem}
li{margin-bottom:8px}
.key-box{background:var(--surface);border-left:4px solid var(--accent);padding:16px 20px;margin:24px 0;border-radius:0 var(--border-radius) var(--border-radius) 0}
.example-box{background:#eef7fc;border:1px solid #c5e1f0;padding:18px 20px;margin:24px 0;border-radius:var(--border-radius)}
.example-box strong{color:var(--primary)}
.related-terms{list-style:none;margin-left:0;display:flex;flex-wrap:wrap;gap:10px}
.related-terms li{margin:0}
.related-terms a{display:inline-block;background:var(--surface);padding:8px 14px;border-radius:999px;font-size:.9rem;font-weight:600;border:1px solid #e5e7eb}
.related-terms a:hover{background:#e8f4fc;text-decoration:none}
.cta{margin:48px 0;padding:32px 28px;background:linear-gradient(135deg,#0f2744 0%,#1a4a7a 45%,#2980b9 100%);color:#fff;border-radius:14px;text-align:center;box-shadow:0 12px 28px rgba(15,39,68,.28);border:1px solid rgba(255,255,255,.12);position:relative;overflow:hidden}
.cta::before{content:'';position:absolute;left:0;top:0;bottom:0;width:6px;background:linear-gradient(180deg,#d62b83,#f472b6)}
.cta a{color:#fff;font-weight:700;text-decoration:none;border-bottom:2px solid #d62b83;padding-bottom:2px}
.cta a:hover{color:#ffe4f1;border-bottom-color:#ffe4f1}
.checklist li{margin-bottom:10px}
"""


def build_article(t: dict, filename: str) -> str:
    term = t["term"]
    definition = t.get("definition") or ""
    example = t.get("example") or ""
    bullets = t.get("bullets") or []
    related = t.get("related_terms") or []
    categories = t.get("categories") or ([t.get("category")] if t.get("category") else ["SEO"])
    img = t.get("featured_image") or ""
    video = t.get("video_url") or ""
    cat_label = categories[0] if categories else "SEO"
    title = f"{term}: SEO Guide 2026 | WordsThatSells"
    meta_desc = (definition[:155] + "…") if len(definition) > 155 else definition
    if not meta_desc:
        meta_desc = f"Learn what {term} means for SEO, crawling, and rankings — with SEA examples and practical steps."
    canonical = f"https://wordsthatsells.website/en/resources/glossary/{filename}"
    related_inline = ", ".join(related_link(r) for r in related[:4]) if related else "related SEO terms"

    og_image_tag = f'<meta property="og:image" content="{esc(img)}">' if img else ""
    img_block = ""
    if img:
        img_block = f'''
    <div class="featured-image-wrapper">
      <img class="featured-image" src="{esc(img)}" width="1200" height="630" alt="{esc(term)} — SEO glossary illustration" loading="eager" decoding="async">
    </div>'''

    example_block = ""
    if example:
        example_block = f'''
    <h2>Real-world example (Southeast Asia)</h2>
    <div class="example-box">
      <p><strong>In practice:</strong> {esc_text(example)}</p>
    </div>'''

    video_block = ""
    if video:
        video_block = f'''
    <h2>Watch a quick explainer</h2>
    <p>Prefer video? Start here: <a href="{esc(video)}" target="_blank" rel="noopener noreferrer">Watch on YouTube</a>.</p>'''

    schema = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": f"{term}: SEO Guide 2026",
        "description": meta_desc,
        "author": {"@type": "Person", "name": "Laurent Laboise"},
        "publisher": {
            "@type": "Organization",
            "name": "WordsThatSells",
            "url": "https://wordsthatsells.website",
        },
        "mainEntityOfPage": canonical,
        "dateModified": date.today().isoformat(),
        "image": img or None,
        "about": {"@type": "DefinedTerm", "name": term, "description": definition},
    }
    schema_json = json.dumps(schema, ensure_ascii=False)

    why = f"""
    <h2>Why {esc_text(term)} matters for SEO</h2>
    <p>For search engines, <strong>{esc_text(term)}</strong> sits at the intersection of <strong>crawling</strong>,
    <strong>indexing</strong>, and <strong>ranking</strong>. Crawlers must discover and understand your pages;
    indexes store what they found; rankings decide which URLs appear for a keyword. When {esc_text(term.lower())}
    is handled poorly, bots waste crawl budget, users bounce, and target keywords become harder to rank.
    When it is handled well, your site becomes clearer to Google and more searchable for the queries your customers type.</p>
    <p>The glossary sidebar on WordsThatSells exists so marketers can jump from a short definition to a full operational
    article—then follow related terms like {related_inline}. That internal linking pattern also helps search engines
    map topical relationships across your content library.</p>
    """

    ranking = f"""
    <h2>Crawling, ranking, and keyword searchability</h2>
    <p>Search visibility is not only about stuffing more keywords. Ranking systems evaluate whether a page is
    <em>findable</em>, <em>understandable</em>, and <em>useful</em>. {esc_text(term)} influences one or more of those layers:</p>
    <ul>
      <li><strong>Crawl access</strong> — Can Googlebot request and render the page without blockers?</li>
      <li><strong>Index eligibility</strong> — Is the content unique, well-structured, and worth storing?</li>
      <li><strong>Relevance signals</strong> — Do titles, headings, body copy, and links match user intent?</li>
      <li><strong>User signals</strong> — Do visitors stay, navigate, and convert—or leave immediately?</li>
    </ul>
    <p>Use the sidebar glossary as a navigation hub: short definitions help humans; full articles expand expertise;
    related-term links tighten the keyword graph. That combination supports both UX and SEO architecture.</p>
    """

    practical = f"""
    <h2>Practical steps for teams in Southeast Asia</h2>
    <ol class="checklist">
      <li><strong>Audit first.</strong> Confirm how {esc_text(term.lower())} currently appears on your site (templates, CMS fields, server config, or content workflows).</li>
      <li><strong>Align keywords.</strong> Pair this concept with primary and secondary keywords your audience searches—especially local modifiers (Laos, Vientiane, Thailand, Vietnam, Indonesia, Singapore) where relevant.</li>
      <li><strong>Make it crawlable.</strong> Ensure bots can reach the affected URLs via internal links, XML sitemaps, and a clean <a href="/en/resources/glossary/robots-txt-best-practices-2026.html">robots.txt</a> policy.</li>
      <li><strong>Connect related topics.</strong> Link from this page to {related_inline} so both users and crawlers understand the topic cluster.</li>
      <li><strong>Measure impact.</strong> Track impressions, clicks, crawl stats (Search Console), and conversions—not vanity rankings alone.</li>
      <li><strong>Document in briefs.</strong> Put {esc_text(term.lower())} requirements into content briefs so writers and developers stay aligned.</li>
    </ol>
    """

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="/css/main.css">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" media="print" onload="this.media='all'">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" media="print" onload="this.media='all'">
    <noscript>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
    </noscript>
    <title>{esc(title)}</title>
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png">
    <meta name="description" content="{esc(meta_desc)}">
    <meta name="robots" content="index, follow">
    <meta name="keywords" content="{esc(term)}, SEO, search engine optimization, crawling, ranking, keywords, Southeast Asia, digital marketing">
    <meta property="og:type" content="article">
    <meta property="og:title" content="{esc(term)}: SEO Guide 2026">
    <meta property="og:description" content="{esc(meta_desc)}">
    <meta property="og:url" content="{esc(canonical)}">
    <meta property="og:site_name" content="WordsThatSells.Website">
    {og_image_tag}
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{esc(term)}: SEO Guide 2026">
    <meta name="twitter:description" content="{esc(meta_desc)}">
    <link rel="canonical" href="{esc(canonical)}">
    <link rel="alternate" hreflang="en" href="{esc(canonical)}">
    <link rel="alternate" hreflang="x-default" href="https://wordsthatsells.website/en/resources/glossary/">
    <style>{CSS}</style>
    <script type="application/ld+json">
    {schema_json}
    </script>
</head>
<body>
  <main class="container">
    <a class="back-link" href="/en/resources/glossary/"><i class="fas fa-arrow-left"></i> Back to SEO Glossary</a>
    <header class="article-header">
      <span class="article-category">{esc_text(cat_label)}</span>
      <h1>{esc_text(term)}: Complete SEO Guide for 2026</h1>
      <div class="article-meta">
        <span><i class="fas fa-book"></i> Glossary deep-dive</span>
        <span><i class="fas fa-globe-asia"></i> SEA marketing focus</span>
        <span><i class="fas fa-search"></i> Crawling · Ranking · Keywords</span>
      </div>
    </header>
    {img_block}
    <article>
    <h2>What is {esc_text(term)}?</h2>
    <p>{esc_text(definition)}</p>
    <div class="key-box">
      <h3 style="margin-top:0">Key concepts</h3>
      {bullets_html(bullets)}
    </div>
    {why}
    {example_block}
    {ranking}
    {practical}
    {video_block}
    <h2>Related glossary terms (keyword connections)</h2>
    <p>Click through to expand the topic cluster. These links help readers learn faster and help search engines understand relationships between SEO concepts.</p>
    {related_html(related)}
    <div class="cta">
      <p style="margin:0 0 12px;font-size:1.15rem;font-weight:600">Need this implemented for your site in Laos or Southeast Asia?</p>
      <p style="margin:0">WordsThatSells builds crawlable sites, content systems, and SEO that ranks.
      <a href="https://wordsthatsells.website/en/contact/">Talk to our team</a> ·
      <a href="/en/resources/glossary/">Browse the full glossary</a></p>
    </div>
    </article>
  </main>
{footer_for(filename)}
</body>
</html>
"""


def main() -> None:
    written = 0
    for t in SEED:
        fn = term_to_file.get(t["term"]) or f"{t.get('slug') or 'term'}-2026.html"
        (OUT / fn).write_text(build_article(t, fn), encoding="utf-8")
        written += 1

    counts = []
    for p in OUT.glob("*.html"):
        if p.name == "index.html":
            continue
        text = re.sub(r"<[^>]+>", " ", p.read_text(errors="ignore"))
        counts.append(len(text.split()))
    print(
        f"written={written} words min/median/max={min(counts)}/{sorted(counts)[len(counts)//2]}/{max(counts)}"
    )
    sample = (OUT / "backlinks-building-strategy-2026.html").read_text()
    print("stub_prompt_gone", "Write 1400" not in sample)
    print("has_h1", "<h1>" in sample)
    print("has_related", "related-terms" in sample)


if __name__ == "__main__":
    main()

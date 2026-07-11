#!/usr/bin/env python3
"""Generate full SEO glossary articles (sidebar "Read full article" targets).

Includes: definition, examples, related-term links, YouTube embed,
sticky mobile-friendly social share dock, solid brand-pink CTA, schema.
"""
from __future__ import annotations

import html
import json
import re
from datetime import date
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
SEED = json.loads((ROOT / "wts-admin/database/glossary_seed_data.json").read_text())
OUT = ROOT / "en/resources/glossary"

FOOTER_CANDIDATE = Path("/tmp/wts-glossary-footer.html")
FOOTER_SRC = FOOTER_CANDIDATE.read_text() if FOOTER_CANDIDATE.exists() else ""


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


def youtube_id(url: str) -> str:
    m = re.search(r"(?:v=|youtu\.be/|embed/)([A-Za-z0-9_-]{6,})", url or "")
    return m.group(1) if m else ""


def footer_for(filename: str) -> str:
    f = FOOTER_SRC
    f = re.sub(r"/en/resources/glossary/[^\"']+\.html", f"/en/resources/glossary/{filename}", f)
    f = re.sub(r"/la/resources/glossary/[^\"']+\.html", f"/la/resources/glossary/{filename}", f)
    f = re.sub(r"/fr/resources/glossary/[^\"']+\.html", f"/fr/resources/glossary/{filename}", f)
    f = re.sub(r"/th/resources/glossary/[^\"']+\.html", f"/th/resources/glossary/{filename}", f)
    return f


CSS = """
:root { --primary:#2c3e50; --accent:#2980b9; --brand:#d62b83; --bg:#fff; --text:#333; --text-light:#555; --surface:#f8f9fa; --border-radius:8px; }
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
.cta{margin:48px 0;padding:32px 28px;background:#d62b83;color:#0f172a;border-radius:14px;text-align:center;box-shadow:0 10px 24px rgba(214,43,131,.35);font-weight:600}
.cta p{color:#0f172a}
.cta a{color:#0f172a;font-weight:800;text-decoration:underline;text-underline-offset:3px}
.cta a:hover{color:#111827;opacity:1}
.checklist li{margin-bottom:10px}
.video-wrap{position:relative;width:100%;padding-bottom:56.25%;height:0;margin:20px 0 12px;border-radius:12px;overflow:hidden;background:#0f172a;box-shadow:0 8px 24px rgba(15,23,42,.2)}
.video-wrap iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.video-fallback{font-size:.95rem;margin-top:0}
/* Sticky share dock — mobile bottom bar; desktop left rail */
.share-dock{
  position:fixed;z-index:900;
  display:flex;align-items:center;gap:8px;
  background:rgba(255,255,255,.97);
  backdrop-filter:blur(10px);
  -webkit-backdrop-filter:blur(10px);
  box-shadow:0 -4px 20px rgba(15,23,42,.14);
  border:1px solid #e5e7eb;
}
.share-dock .share-label{font-weight:700;color:var(--primary);font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
.share-dock .share-btn{
  display:inline-flex;align-items:center;justify-content:center;
  width:44px;height:44px;min-width:44px;min-height:44px;
  border-radius:50%;font-size:1.05rem;color:#fff!important;text-decoration:none;border:0;cursor:pointer;padding:0;
  -webkit-tap-highlight-color:transparent;
}
.share-dock .share-btn span{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
.share-dock .share-btn:hover,.share-dock .share-btn:focus{filter:brightness(1.08);color:#fff!important;outline:2px solid #d62b83;outline-offset:2px}
.share-dock .share-btn.fb{background:#1877f2}
.share-dock .share-btn.x{background:#111827}
.share-dock .share-btn.li{background:#0a66c2}
.share-dock .share-btn.wa{background:#25d366}
.share-dock .share-btn.tg{background:#229ed9}
.share-dock .share-btn.copy{background:#64748b}
.share-dock .share-btn.native{background:#d62b83}
@media (max-width:899px){
  .share-dock{
    left:0;right:0;bottom:0;
    justify-content:space-around;
    padding:10px 6px calc(10px + env(safe-area-inset-bottom,0px));
    border-radius:16px 16px 0 0;
    border-bottom:0;
  }
  body{padding-bottom:78px}
  .share-dock .share-label{display:none}
}
@media (min-width:900px){
  .share-dock{
    left:14px;top:50%;transform:translateY(-50%);
    flex-direction:column;
    padding:14px 10px;
    border-radius:16px;
    gap:10px;
    box-shadow:0 8px 28px rgba(15,23,42,.16);
  }
  .share-dock .share-label{writing-mode:vertical-rl;transform:rotate(180deg);margin:2px 0 6px}
  .share-dock .share-btn{width:46px;height:46px}
}
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

    share_text = f"{term} — SEO guide on WordsThatSells"
    u = quote(canonical, safe="")
    txt = quote(share_text, safe="")
    fb = f"https://www.facebook.com/sharer/sharer.php?u={u}"
    tw = f"https://twitter.com/intent/tweet?url={u}&text={txt}"
    li = f"https://www.linkedin.com/sharing/share-offsite/?url={u}"
    wa = f"https://api.whatsapp.com/send?text={txt}%20{u}"
    tg = f"https://t.me/share/url?url={u}&text={txt}"

    og_image_tag = f'<meta property="og:image" content="{esc(img)}">' if img else ""
    img_block = ""
    if img:
        img_block = f"""
    <div class="featured-image-wrapper">
      <img class="featured-image" src="{esc(img)}" width="1200" height="630" alt="{esc(term)} — SEO glossary illustration" loading="eager" decoding="async">
    </div>"""

    example_block = ""
    if example:
        example_block = f"""
    <h2>Real-world example (Southeast Asia)</h2>
    <div class="example-box">
      <p><strong>In practice:</strong> {esc_text(example)}</p>
    </div>"""

    ytid = youtube_id(video)
    if ytid:
        video_block = f"""
    <h2>Watch a quick explainer</h2>
    <div class="video-wrap">
      <iframe
        src="https://www.youtube.com/embed/{ytid}"
        title="{esc(term)} — YouTube explainer"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"></iframe>
    </div>
    <p class="video-fallback"><a href="{esc(video)}" target="_blank" rel="noopener noreferrer">Open on YouTube</a></p>"""
    elif video:
        video_block = f"""
    <h2>Watch a quick explainer</h2>
    <p><a href="{esc(video)}" target="_blank" rel="noopener noreferrer">Watch on YouTube</a></p>"""
    else:
        video_block = ""

    share_block = f"""
    <nav class="share-dock" aria-label="Share this article">
      <span class="share-label">Share</span>
      <a class="share-btn fb" href="{fb}" target="_blank" rel="noopener noreferrer" aria-label="Share on Facebook" title="Facebook"><i class="fab fa-facebook-f"></i><span>Facebook</span></a>
      <a class="share-btn x" href="{tw}" target="_blank" rel="noopener noreferrer" aria-label="Share on X" title="X"><i class="fab fa-x-twitter"></i><span>X</span></a>
      <a class="share-btn li" href="{li}" target="_blank" rel="noopener noreferrer" aria-label="Share on LinkedIn" title="LinkedIn"><i class="fab fa-linkedin-in"></i><span>LinkedIn</span></a>
      <a class="share-btn wa" href="{wa}" target="_blank" rel="noopener noreferrer" aria-label="Share on WhatsApp" title="WhatsApp"><i class="fab fa-whatsapp"></i><span>WhatsApp</span></a>
      <a class="share-btn tg" href="{tg}" target="_blank" rel="noopener noreferrer" aria-label="Share on Telegram" title="Telegram"><i class="fab fa-telegram-plane"></i><span>Telegram</span></a>
      <button type="button" class="share-btn copy" id="copy-link-btn" aria-label="Copy link" title="Copy link"><i class="fas fa-link"></i><span>Copy</span></button>
      <button type="button" class="share-btn native" id="native-share-btn" aria-label="More share options" title="More"><i class="fas fa-share-alt"></i><span>More</span></button>
    </nav>
    <script>
    (function() {{
      var url = {json.dumps(canonical)};
      var title = {json.dumps(share_text)};
      var copyBtn = document.getElementById('copy-link-btn');
      var moreBtn = document.getElementById('native-share-btn');
      if (copyBtn) {{
        copyBtn.addEventListener('click', function() {{
          if (navigator.clipboard && navigator.clipboard.writeText) {{
            navigator.clipboard.writeText(url).then(function() {{
              copyBtn.innerHTML = '<i class="fas fa-check"></i><span>Copied</span>';
              setTimeout(function() {{ copyBtn.innerHTML = '<i class="fas fa-link"></i><span>Copy</span>'; }}, 1600);
            }});
          }} else {{ window.prompt('Copy this link:', url); }}
        }});
      }}
      if (moreBtn) {{
        if (!navigator.share) {{ moreBtn.style.display = 'none'; }}
        moreBtn.addEventListener('click', function() {{
          navigator.share({{ title: title, url: url, text: title }}).catch(function(){{}});
        }});
      }}
    }})();
    </script>
    """

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
    if ytid:
        schema["video"] = {
            "@type": "VideoObject",
            "name": f"{term} explainer",
            "embedUrl": f"https://www.youtube.com/embed/{ytid}",
            "contentUrl": video,
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
  {share_block}
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
    sample = (OUT / "backlinks-building-strategy-2026.html").read_text()
    print(
        f"written={written} sticky={'.share-dock' in sample and 'position:fixed' in sample} "
        f"embed={'youtube.com/embed' in sample} pink_cta={'background:#d62b83' in sample} "
        f"dark_font={'color:#0f172a' in sample}"
    )


if __name__ == "__main__":
    main()

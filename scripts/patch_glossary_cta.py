#!/usr/bin/env python3
"""Patch glossary articles: versioned end-CTA, x-default = canonical, GA4 snippet.

For every glossary article (en/resources/glossary/*-2026*.html, which covers
both *-2026.html and *-2026-guide.html), except redirect stubs (pages
containing 'Moved permanently') and backup files:

1. Replace the end-of-article <div class="cta"> block with a versioned block
   <div class="cta" id="wts-end-cta" data-cta-version="2"> (pricing pill button,
   the existing #open-team-form button the slide-panel JS binds to, portal and
   glossary links).
2. Set the hreflang="x-default" alternate href equal to the page's own
   rel="canonical" href.
3. Collapse the duplicated trailing </body></html> pairs (pre-existing
   corruption from earlier patching: pages end with 5 copies) into one.
4. Inject the GA4 snippet immediately before the first </body> when
   googletagmanager.com/gtag is absent.

Idempotent: a second run yields byte-identical files. Prints a summary
(patched / skipped stubs / already-current / failed) and exits non-zero if any
file failed.

Usage:
    python3 scripts/patch_glossary_cta.py [--root DIR]

--root defaults to the repo root; if DIR/en/resources/glossary does not exist,
DIR itself is treated as the glossary directory (handy for test copies).
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GLOSSARY = ROOT / "en/resources/glossary"

CTA_VERSION = "2"

# The whole current versioned block (no nested <div> inside, so non-greedy is safe).
VERSIONED_CTA_RE = re.compile(
    r'<div class="cta" id="wts-end-cta"[^>]*>[\s\S]*?</div>'
)
# The legacy block, anchored on its heading (no nested <div> inside).
LEGACY_CTA_RE = re.compile(
    r'<div class="cta">\s*<p[^>]*>Need this implemented[\s\S]*?</div>'
)
CANONICAL_RE = re.compile(r'<link rel="canonical" href="([^"]+)"')
X_DEFAULT_RE = re.compile(
    r'(<link rel="alternate" hreflang="x-default" href=")[^"]*(")'
)
# One or more </body></html> pairs (whitespace-separated) at end of file.
TRAILING_CLOSERS_RE = re.compile(r"(?:\s*</body>\s*</html>)+\s*$")

# Matched text starts at column 4 in the articles, so the first line carries no
# indent of its own and the closing tag re-creates the original 4-space indent.
NEW_CTA = """<div class="cta" id="wts-end-cta" data-cta-version="2">
      <p style="margin:0 0 12px;font-size:1.15rem;font-weight:600">Need this implemented for your site in Laos or Southeast Asia?</p>
      <p style="margin:0 0 18px">WordsThatSells runs scoped monthly plans for SEA businesses — see exactly what they cost.</p>
      <p style="margin:0 0 14px"><a class="cta-primary-link" href="/en/digital-marketing-services/prices/" style="display:inline-block;background:#ffffff;color:#d62b83;font-weight:800;text-decoration:none;padding:12px 26px;border-radius:999px;margin:0 8px 8px 0" onclick="typeof gtag==='function'&&gtag('event','cta_click',{cta_id:'glossary_end_prices',page_type:'glossary',destination:'prices'})">See plans &amp; pricing</a>
      <button type="button" class="cta-team-btn" id="open-team-form">Talk to our team</button></p>
      <p style="margin:0;font-size:.95rem"><a href="https://admin.wordsthatsells.website/portal/login?from=glossary&amp;src=end_cta" onclick="typeof gtag==='function'&&gtag('event','cta_click',{cta_id:'glossary_end_portal',page_type:'glossary',destination:'portal'})">Open client portal</a> ·
      <a href="/en/resources/glossary/">Browse the full glossary</a></p>
    </div>"""

GA_SNIPPET = """<!-- Analytics after content so it never competes with LCP -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-LMRKC1VBBB"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-LMRKC1VBBB', { transport_type: 'beacon' });
    </script>
"""


def is_backup(name: str) -> bool:
    lower = name.lower()
    return (
        "backup" in lower
        or lower.endswith("~")
        or bool(re.search(r"\.(bak|orig|old|save|copy)(\.|$)", lower))
    )


def patch_text(t: str, name: str) -> str:
    """Return the patched text (may equal the input when already current)."""
    # 1) Versioned end-CTA block (deterministic: any existing #wts-end-cta div
    #    is rewritten wholesale, so re-runs converge byte-for-byte).
    t2, n = VERSIONED_CTA_RE.subn(lambda m: NEW_CTA, t, count=1)
    if not n:
        t2, n = LEGACY_CTA_RE.subn(lambda m: NEW_CTA, t, count=1)
    if not n:
        raise ValueError(f"{name}: end-of-article CTA block not found")
    t = t2

    # 2) x-default hreflang must equal the page's own canonical.
    m = CANONICAL_RE.search(t)
    if not m:
        raise ValueError(f"{name}: rel=canonical not found")
    canonical = m.group(1)
    t, n = X_DEFAULT_RE.subn(
        lambda mm: mm.group(1) + canonical + mm.group(2), t, count=1
    )
    if not n:
        raise ValueError(f"{name}: hreflang=x-default alternate not found")

    # 3) Collapse duplicated trailing </body></html> pairs into a single one
    #    (idempotent: a single trailing pair re-matches and re-emits itself).
    t = TRAILING_CLOSERS_RE.sub("\n</body>\n</html>\n", t)

    # 4) GA4 immediately before the first </body> (never duplicated).
    if "googletagmanager.com/gtag" not in t:
        idx = t.find("</body>")
        if idx < 0:
            raise ValueError(f"{name}: </body> not found")
        t = t[:idx] + GA_SNIPPET + t[idx:]

    return t


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--root",
        type=Path,
        default=ROOT,
        help="site root (default: repo root); if ROOT/en/resources/glossary is "
        "missing, ROOT itself is used as the glossary directory",
    )
    args = ap.parse_args()

    root = args.root.resolve()
    glossary = root / "en/resources/glossary"
    if not glossary.is_dir():
        glossary = root
    if not glossary.is_dir():
        print(f"error: glossary directory not found under {root}", file=sys.stderr)
        return 2

    patched = skipped_stub = already_current = failed = 0
    files = sorted(
        p for p in glossary.glob("*.html") if re.search(r"-2026.*\.html$", p.name)
    )
    if not files:
        print(f"error: no *-2026*.html files found in {glossary}", file=sys.stderr)
        return 2

    for p in files:
        if is_backup(p.name):
            skipped_stub += 1
            print(f"skip (backup): {p.name}")
            continue
        try:
            t = p.read_text(encoding="utf-8")
            if "Moved permanently" in t:
                skipped_stub += 1
                print(f"skip (stub): {p.name}")
                continue
            new = patch_text(t, p.name)
            if new != t:
                p.write_text(new, encoding="utf-8")
                patched += 1
            else:
                already_current += 1
        except Exception as e:  # per-file tolerance: keep going, report at end
            failed += 1
            print(f"FAILED: {p.name}: {e}", file=sys.stderr)

    print(
        f"patched={patched} skipped_stub={skipped_stub} "
        f"already_current={already_current} failed={failed} "
        f"(cta_version={CTA_VERSION}, dir={glossary})"
    )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

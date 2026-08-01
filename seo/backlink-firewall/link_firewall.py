#!/usr/bin/env python3
"""
link_firewall.py — WordsThatSells Link Quality Firewall
=======================================================

Screens new referring domains / backlinks against the
"WordsThatSells Link Quality Firewall" rules and classifies each as:

    ACCEPT  - passes all checks, safe to keep / pursue
    REVIEW  - mixed signals, needs a quick manual look
    REJECT  - matches spam footprints, add to disavow file

No paid APIs required. All checks work from the domain name itself,
plus optional metric columns (dr, traffic, first_seen) if your CSV
export includes them (e.g. from Ahrefs).

Usage
-----
    # Screen a CSV of backlinks / referring domains:
    python3 link_firewall.py new_backlinks.csv

    # Screen a plain text file (one domain or URL per line):
    python3 link_firewall.py domains.txt

    # Write a full CSV report + disavow lines for the rejects:
    python3 link_firewall.py new_backlinks.csv \
        --report report.csv --disavow-out disavow_additions.txt

    # Add every REJECT to the persistent blacklist for next time:
    python3 link_firewall.py new_backlinks.csv --update-blacklist

Input CSV format (flexible — extra columns are ignored)
-------------------------------------------------------
    domain,dr,traffic,first_seen,anchor,target_url
    example.com,35,1200,2024-03-01,"great article",https://wordsthatsells.website/
    rankzly.shop,1,0,2026-07-20,"buy backlinks",https://wordsthatsells.website/

Only the "domain" column is required. A column named "url",
"referring page", "referring domain" or "source" also works.
Ahrefs exports work out of the box.

Files used (same directory as this script by default)
-----------------------------------------------------
    firewall_config.json   - all thresholds & patterns (editable)
    blacklist_domains.txt  - growing list of known spam domains
    whitelist_domains.txt  - domains that always pass (optional)
"""

import argparse
import csv
import json
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

SCRIPT_DIR = Path(__file__).resolve().parent

# ---------------------------------------------------------------------------
# Fallback config (used only if firewall_config.json is missing).
# Keep firewall_config.json as the single source of truth.
# ---------------------------------------------------------------------------
DEFAULT_CONFIG = {
    "thresholds": {
        "min_domain_rating": 20,
        "min_organic_traffic_monthly": 100,
        "min_domain_age_years": 1,
        "max_hyphens_in_domain": 2,
        "max_domain_name_length": 30,
    },
    "scoring": {"reject_at": 60, "review_at": 25},
    "penalties": {
        "blacklisted_tld": 60, "suspicious_tld": 25, "spam_keyword": 30,
        "spam_keyword_extra": 15, "suspicious_tld_spam_combo": 20,
        "spam_bigram": 60, "too_many_hyphens": 20,
        "excessive_length": 15, "digits_in_domain": 10,
        "known_blacklist_domain": 100, "low_dr": 20, "no_traffic": 15,
        "young_domain": 15,
    },
    "trusted_tlds": ["com", "org", "net", "edu", "gov", "co", "io", "dev",
                     "la", "th", "vn", "kh", "sg", "asia", "co.th", "com.la",
                     "org.la", "co.uk"],
    "tld_blacklist": ["shop", "store", "space", "icu", "top", "click", "buzz",
                      "cyou", "rest", "monster", "cfd", "sbs", "bond", "lol"],
    "tld_suspicious": ["xyz", "online", "site", "website", "live", "world",
                       "today", "fun", "pro", "vip", "work", "link"],
    "spam_keywords": ["rank", "backlink", "seo", "linkbuild", "dofollow",
                      "pbn", "guestpost", "outreach", "high-da", "outrank",
                      "crawl-budget", "traffic-surge", "seoexpress",
                      "webrank", "siterank", "linksnexa", "rankzly"],
    "spam_bigrams": [["digital", "pr"], ["link", "boost"], ["seo", "express"],
                     ["web", "rank"], ["site", "rank"], ["domain", "rank"]],
    "topical_whitelist_keywords": ["marketing", "digital", "business", "ai",
                                   "laos", "lao", "asean", "asia", "content"],
}


def load_json(path: Path, fallback):
    if path.exists():
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    return fallback


def load_domain_list(path: Path) -> set:
    """Load one-domain-per-line file, ignoring blanks and # comments."""
    domains = set()
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip().lower()
            if line and not line.startswith("#"):
                domains.add(line.removeprefix("domain:"))
    return domains


def extract_domain(raw: str) -> str:
    """Normalize a URL or hostname to a bare registrable-ish domain."""
    raw = raw.strip().lower()
    if not raw:
        return ""
    if "//" in raw:
        raw = urlparse(raw).netloc or raw
    raw = raw.split("/")[0].split(":")[0]
    return raw.removeprefix("www.")


def get_tld(domain: str) -> str:
    parts = domain.rsplit(".", 2)
    # Handle common two-level ccTLDs like com.la, co.th, co.uk
    if len(parts) == 3 and parts[1] in {"com", "co", "org", "net", "edu", "gov", "ac"}:
        return f"{parts[1]}.{parts[2]}"
    return parts[-1]


def domain_words(domain: str) -> list:
    """Split the domain name (without TLD) into words on hyphens/digits."""
    name = domain.rsplit("." + get_tld(domain), 1)[0]
    # Drop subdomains for word analysis, keep the main label
    name = name.split(".")[-1] if "." in name else name
    return [w for w in re.split(r"[-_\d]+", name) if w]


def evaluate(domain: str, row: dict, cfg: dict, blacklist: set,
             whitelist: set) -> dict:
    """Apply all firewall rules to one domain. Returns a result dict."""
    pen = cfg["penalties"]
    thr = cfg["thresholds"]
    score = 0
    reasons = []

    if domain in whitelist:
        return {"domain": domain, "decision": "ACCEPT", "score": 0,
                "reasons": ["whitelisted"]}

    # --- Rule 0: known spam domain (exact or parent-domain match) ---
    if domain in blacklist or any(domain.endswith("." + b) for b in blacklist):
        score += pen["known_blacklist_domain"]
        reasons.append("domain already on the known-spam blacklist")

    # --- Rule 1: TLD checks (trusted TLDs skip the suspicious penalty) ---
    tld = get_tld(domain)
    suspicious_tld_hit = False
    if tld in cfg["tld_blacklist"]:
        score += pen["blacklisted_tld"]
        reasons.append(f"blacklisted TLD .{tld} (spam-heavy registry)")
    elif tld not in cfg.get("trusted_tlds", []) and tld in cfg.get("tld_suspicious", []):
        suspicious_tld_hit = True
        score += pen["suspicious_tld"]
        reasons.append(f"suspicious TLD .{tld} (extra scrutiny)")

    # --- Rule 2: spam keywords in the domain name (TLD stripped so the
    #     TLD itself never triggers keyword or topical matches) ---
    name_only = domain[: -(len(tld) + 1)] if domain.endswith("." + tld) else domain
    name_for_match = name_only.replace(".", "-")
    hits = [kw for kw in cfg["spam_keywords"] if kw in name_for_match]
    if hits:
        score += pen["spam_keyword"] + pen["spam_keyword_extra"] * (len(hits) - 1)
        reasons.append("spam keyword(s) in domain name: " + ", ".join(hits))
        if suspicious_tld_hit:
            # Spam keyword + throwaway TLD is the exact footprint of the
            # domains this toolkit disavows — escalate straight to REJECT.
            score += pen.get("suspicious_tld_spam_combo", 20)
            reasons.append("spam keyword combined with suspicious TLD")

    # --- Rule 3: spam keyword combinations (bigrams) ---
    words = set(domain_words(domain))
    for a, b in cfg.get("spam_bigrams", []):
        if a in words and b in words:
            score += pen["spam_bigram"]
            reasons.append(f"spam word combination '{a}'+'{b}' in domain")
            break

    # --- Rule 4: structural red flags (on the registrable label only, so
    #     compound TLDs like co.th/com.la and subdomains don't skew checks) ---
    name = name_only.split(".")[-1]
    hyphens = name.count("-")
    if hyphens > thr["max_hyphens_in_domain"]:
        score += pen["too_many_hyphens"]
        reasons.append(f"{hyphens} hyphens in domain (keyword-stuffed pattern)")
    if len(name) > thr["max_domain_name_length"]:
        score += pen["excessive_length"]
        reasons.append(f"domain name unusually long ({len(name)} chars)")
    if re.search(r"\d", name):
        score += pen["digits_in_domain"]
        reasons.append("digits in domain name")

    # --- Rule 5: optional metrics if present in the CSV row ---
    dr = _num(row.get("dr") or row.get("domain rating"))
    if dr is not None and dr < thr["min_domain_rating"]:
        score += pen["low_dr"]
        reasons.append(f"DR {dr:g} below minimum {thr['min_domain_rating']}")
    traffic = _num(row.get("traffic") or row.get("organic traffic"))
    if traffic is not None and traffic < thr["min_organic_traffic_monthly"]:
        score += pen["no_traffic"]
        reasons.append(f"organic traffic {traffic:g} below minimum "
                       f"{thr['min_organic_traffic_monthly']}/month")
    age = _age_years(row.get("first_seen") or row.get("first seen"))
    min_age = thr.get("min_domain_age_years")
    if age is not None and min_age is not None and age < min_age:
        score += pen.get("young_domain", 15)
        reasons.append(f"first seen only {age:.1f} year(s) ago "
                       f"(minimum age {min_age})")

    # --- Positive signal: topical relevance can soften a REVIEW ---
    topical = [kw for kw in cfg.get("topical_whitelist_keywords", [])
               if kw in name_for_match]
    if topical and score < cfg["scoring"]["reject_at"]:
        score = max(0, score - 10)
        reasons.append("topically relevant keyword(s): " + ", ".join(topical))

    if score >= cfg["scoring"]["reject_at"]:
        decision = "REJECT"
    elif score >= cfg["scoring"]["review_at"]:
        decision = "REVIEW"
    else:
        decision = "ACCEPT"
        if not reasons:
            reasons.append("no spam signals detected")

    return {"domain": domain, "decision": decision, "score": score,
            "reasons": reasons}


def _num(value):
    """Parse '1,200' / '35.0' / '' → float or None."""
    if value is None:
        return None
    value = str(value).replace(",", "").strip()
    try:
        return float(value)
    except ValueError:
        return None


def _age_years(value):
    """Parse a 'first_seen' date ('2024-03-01', '2024/03/01', ISO datetime,
    or bare '2024') → age in years from today, or None if unparseable."""
    if not value:
        return None
    match = re.match(r"(\d{4})(?:[-/](\d{1,2}))?(?:[-/](\d{1,2}))?",
                     str(value).strip())
    if not match:
        return None
    year, month, day = (int(g) if g else 1 for g in match.groups())
    try:
        seen = date(year, month, day)
    except ValueError:
        return None
    return (date.today() - seen).days / 365.25


DOMAIN_COLUMNS = ("domain", "referring domain", "referring page url",
                  "referring page", "url", "source", "backlink")


def read_input(path: Path) -> list:
    """Read a CSV (with header) or plain text file into a list of rows."""
    rows = []
    text = path.read_text(encoding="utf-8-sig")
    first_line = text.splitlines()[0] if text.strip() else ""
    is_csv = path.suffix.lower() == ".csv" or "," in first_line

    if is_csv:
        reader = csv.DictReader(text.splitlines())
        cols = [c.lower().strip() for c in (reader.fieldnames or [])]
        dom_col = next((c for c in DOMAIN_COLUMNS if c in cols), None)
        if not dom_col:
            sys.exit(f"error: no domain/url column found in {path.name}; "
                     f"expected one of: {', '.join(DOMAIN_COLUMNS)}")
        for raw in reader:
            row = {k.lower().strip(): (v or "").strip()
                   for k, v in raw.items() if k}
            dom = extract_domain(row.get(dom_col, ""))
            if dom:
                rows.append((dom, row))
    else:
        for line in text.splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                dom = extract_domain(line)
                if dom:
                    rows.append((dom, {}))
    return rows


def main() -> None:
    ap = argparse.ArgumentParser(
        description="WordsThatSells Link Quality Firewall — screen new "
                    "referring domains for spam footprints.")
    ap.add_argument("input", help="CSV or text file of domains/backlinks")
    ap.add_argument("--config", default=SCRIPT_DIR / "firewall_config.json",
                    type=Path, help="firewall config JSON")
    ap.add_argument("--blacklist", default=SCRIPT_DIR / "blacklist_domains.txt",
                    type=Path, help="known spam domains file")
    ap.add_argument("--whitelist", default=SCRIPT_DIR / "whitelist_domains.txt",
                    type=Path, help="always-accept domains file")
    ap.add_argument("--report", type=Path,
                    help="write full results to this CSV file")
    ap.add_argument("--disavow-out", type=Path,
                    help="write 'domain:' disavow lines for all REJECTs")
    ap.add_argument("--update-blacklist", action="store_true",
                    help="append REJECT domains to the blacklist file")
    args = ap.parse_args()

    cfg = load_json(Path(args.config), DEFAULT_CONFIG)
    blacklist = load_domain_list(Path(args.blacklist))
    whitelist = load_domain_list(Path(args.whitelist))

    seen, results = set(), []
    for dom, row in read_input(Path(args.input)):
        if dom in seen:
            continue
        seen.add(dom)
        results.append(evaluate(dom, row, cfg, blacklist, whitelist))

    results.sort(key=lambda r: (-r["score"], r["domain"]))

    # ---- console report ----
    counts = {"ACCEPT": 0, "REVIEW": 0, "REJECT": 0}
    print(f"\nWordsThatSells Link Quality Firewall — {date.today().isoformat()}")
    print(f"Screened {len(results)} unique domains from {args.input}\n")
    print(f"{'DECISION':<8} {'SCORE':>5}  {'DOMAIN':<45} REASONS")
    print("-" * 110)
    for r in results:
        counts[r["decision"]] += 1
        print(f"{r['decision']:<8} {r['score']:>5}  {r['domain']:<45} "
              f"{'; '.join(r['reasons'])}")
    print("-" * 110)
    print(f"Summary: {counts['ACCEPT']} ACCEPT / {counts['REVIEW']} REVIEW / "
          f"{counts['REJECT']} REJECT\n")

    # ---- CSV report ----
    if args.report:
        with open(args.report, "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(["domain", "decision", "score", "reasons"])
            for r in results:
                w.writerow([r["domain"], r["decision"], r["score"],
                            "; ".join(r["reasons"])])
        print(f"Report written to {args.report}")

    rejects = [r["domain"] for r in results if r["decision"] == "REJECT"]

    # ---- disavow additions ----
    if args.disavow_out and rejects:
        with open(args.disavow_out, "w", encoding="utf-8") as fh:
            fh.write(f"# Disavow additions generated {date.today().isoformat()}"
                     f" from {Path(args.input).name}\n")
            for dom in sorted(rejects):
                fh.write(f"domain:{dom}\n")
        print(f"{len(rejects)} disavow line(s) written to {args.disavow_out} "
              f"— merge into disavow.txt and re-upload the FULL file.")

    # ---- grow the persistent blacklist ----
    if args.update_blacklist and rejects:
        new = sorted(set(rejects) - blacklist)
        if new:
            with open(args.blacklist, "a", encoding="utf-8") as fh:
                fh.write(f"\n# Added {date.today().isoformat()} by link_firewall.py\n")
                fh.writelines(dom + "\n" for dom in new)
            print(f"{len(new)} new domain(s) appended to {args.blacklist}")

    sys.exit(1 if rejects else 0)  # non-zero exit lets cron/CI flag rejects


if __name__ == "__main__":
    main()

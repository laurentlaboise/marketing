# WordsThatSells Backlink Cleanup & Link Quality Firewall

Toolkit for cleaning up and protecting the backlink profile of
**wordsthatsells.website** (Ahrefs snapshot, August 2026: DR 18, 440
backlinks / 365 referring domains, ~97–99% nofollow, dominated by
.shop/.store SEO-seller spam).

## Files in this folder

| File | Purpose |
|---|---|
| `disavow.txt` | Ready-to-upload Google disavow file |
| `link_firewall.py` | Screens new referring domains (ACCEPT / REVIEW / REJECT) |
| `firewall_config.json` | All firewall thresholds and spam patterns (editable) |
| `blacklist_domains.txt` | Growing list of confirmed spam domains |
| `whitelist_domains.txt` | Domains that always pass |
| `sample_backlinks.csv` | Example input format |

Quick start:

```bash
python3 link_firewall.py sample_backlinks.csv --report report.csv --disavow-out new_disavow.txt
```

---

## 1. Classification of current referring domains

### Toxic / Spam — disavow (all 17 named domains + everything matching the same footprint)

`linksnexa.shop, rankbasket.shop, webrankinsights.shop, nexabacklinks.shop,
siterankexpress.shop, rankcart.shop, modern-studio-outrank-hq-blogger.store,
seoexpress.space, rankyour.website, domainrankresults.shop,
rankseopartners.shop, high-da-and-crawl-budget-strategic-exchange.store,
linkrankboost.shop, seomart.shop, linkory.shop,
expert-systems-for-traffic-surge-and-digital-pr.store,
instant-webpage-seoexpress-consultants.store`

Reasons (all of them share this footprint):

- **Disposable spam TLDs** (.shop / .store / .space) chosen because they cost ~$1;
  no real business uses them for an SEO agency site.
- **Keyword-stuffed domain names** (`rank`, `backlink`, `seo`, `link`,
  `high-da`, `crawl-budget`, `traffic-surge`) — a classic link-scheme footprint
  Google explicitly pattern-matches.
- **Fake testimonials / fake case studies** mentioning wordsthatsells.website —
  fabricated content whose only purpose is selling link packages; this is
  exactly the "link schemes" behavior in Google's spam policies.
- **No editorial value**: no real traffic, no topical relevance, near-zero DR,
  and the links were never requested. Association with these networks is the
  risk, not the (nonexistent) equity they pass.
- The long hyphenated .store domains (3–7 hyphens, 30–50 characters) are
  programmatically generated throwaways — the strongest spam signal of all.

### Borderline — review, do not disavow yet

- **reelnreel.com (DR 44) — pingback**: a real video-marketing site with real
  authority. Pingbacks are low-value (usually nofollow, non-editorial) but
  harmless. **Keep.** Optionally reach out to convert the mention into a
  proper editorial link.
- **Any other domain in the export that is NOT on a spam TLD and has no spam
  keywords** but is off-topic or very low DR: leave it alone. Disavowing
  neutral links has no upside; only disavow clear manipulation.

### Acceptable / Keep

- reelnreel.com and any genuine directory, social profile, or business listing
  (even nofollow). Nofollow links from real sites are a normal part of a
  healthy profile — do not disavow links just for being nofollow.

**Rule of thumb applied:** disavow only what matches the manipulative
footprint. When in doubt on a real website, keep it — Google already ignores
most weak links; the disavow file is for protection against pattern-level
association, not for pruning every low-DR link.

---

## 2. Disavow file

See [`disavow.txt`](disavow.txt). To extend it, export the full referring
domains list from Ahrefs and run:

```bash
python3 link_firewall.py ahrefs_export.csv --disavow-out new_disavow.txt
```

then merge the generated lines into `disavow.txt` (Group 6) and re-upload the
**full cumulative file** (each upload replaces the previous one).

---

## 3. Google Search Console cleanup — step by step

### Upload

1. Verify wordsthatsells.website in Google Search Console (GSC) if not already.
2. Open the disavow tool directly: <https://search.google.com/search-console/disavow-links>
   (it is not in the normal GSC menu).
3. Select the property. If your Domain property is not listed in the dropdown,
   add a **URL-prefix property** for `https://wordsthatsells.website/` in GSC,
   verify it, and select that one.
4. Click **Upload disavow list** and choose `disavow.txt`
   (UTF-8 plain text, one entry per line, `#` comments allowed,
   max 100,000 lines / 2 MB — this file is far below both limits).
5. Confirm the success message showing the number of domains/URLs parsed.
   Fix any reported line errors and re-upload.
6. Record the upload date. **Do not** expect a manual-action-style
   confirmation email; a parse summary in the tool is all you get.

### Monitor over 30–90 days

7. Google applies the disavow as it recrawls each linking page, so the effect
   is gradual (typically 4–12 weeks).
8. Every 2 weeks, check **GSC → Links → Top linking sites**: the spam domains
   should slowly drop as pages are recrawled (they may remain listed —
   GSC shows discovered links even when disavowed; that is normal).
9. Watch **GSC → Performance** for impressions/clicks trends. Expect little
   movement — these links passed almost nothing — the goal is risk removal,
   not a ranking jump. Small stabilization is a win.
10. Re-run Ahrefs free Backlink Checker monthly and screen any new domains
    with `link_firewall.py`.

### If the disavow tool shows errors / issues

11. **"Couldn't parse line N"** → fix the syntax: must be exactly
    `domain:example.com` or a full `https://...` URL; no spaces, no `www.` in
    domain lines, no blank `domain:` entries. Save as plain UTF-8 `.txt`.
12. **File replaced unintentionally** → uploads are not additive. Always keep
    `disavow.txt` in this repo as the master copy and upload the whole file.
13. **Wrong property selected** → disavows apply per property; make sure it
    was uploaded to the property that serves the live site (https, non-www).
14. To undo anything, re-upload a corrected file, or **Cancel disavow** to
    remove it entirely.

### Re-checking later

15. Monthly: Ahrefs free Backlink Checker (top 100 backlinks + referring
    domains view) and Website Authority Checker for DR trend.
16. Quarterly: full pass — export GSC → Links → Top linking sites (Export
    button), run through `link_firewall.py`, append new REJECTs to
    `disavow.txt`, re-upload.

---

## 4. WordsThatSells Link Quality Firewall

### Human-readable checklist — a link must pass ALL hard gates

**Hard gates (any failure = REJECT):**
- [ ] Domain is NOT on `blacklist_domains.txt`
- [ ] TLD is NOT on the blacklist (.shop, .store, .space, .icu, .top, .click,
      .buzz, .cyou, .rest, .monster, .cfd, .sbs, .bond, .lol, …)
- [ ] Domain name contains NO spam keywords (`rank`, `backlink`, `seo`,
      `linkbuild`, `dofollow`, `pbn`, `guestpost`, `high-da`, `outrank`,
      `crawl-budget`, `traffic-surge`, `seoexpress`, `linksnexa`, `rankzly`, …)
      and no spam word-combinations (`web+rank`, `link+boost`, `digital+pr`
      on a cheap TLD, …)
- [ ] Fewer than 3 hyphens and under ~30 characters in the domain name
- [ ] The linking page is a real page a human would read (not a fake
      testimonial, link-farm list, or auto-generated "case study")
- [ ] Nobody is selling the link as part of a "DA boost" package

**Quality thresholds (miss = REVIEW, not auto-reject):**
- [ ] Ahrefs DR ≥ **20** (prefer 30+ for outreach targets)
- [ ] Organic traffic ≥ **100/month** (any real visibility in Ahrefs free
      Traffic Checker)
- [ ] Domain age ≥ **1 year** (prefer 2+; check via whois/Wayback)
- [ ] Topically relevant: digital marketing, SEO, AI, content, business,
      Laos, Southeast Asia, travel/tech media in the region
- [ ] Placement is **editorial in-content** (paragraph link in an article,
      resource page, interview, podcast notes) — not sitewide footer/sidebar,
      comment spam, or profile links
- [ ] Dofollow preferred, but nofollow from a strong relevant site (news,
      Wikipedia-style, directories) is still accepted — a natural profile is
      roughly 60–80% dofollow; never chase dofollow from weak domains
- [ ] Site has real branding: about page, named authors, working contact,
      consistent publishing history

**Decision rule:** all hard gates pass + ≥5 of 7 quality thresholds → ACCEPT.
All hard gates pass but <5 thresholds → REVIEW manually. Any hard gate
fails → REJECT (and add to blacklist).

### Machine-readable configuration

The same rules live in [`firewall_config.json`](firewall_config.json) —
thresholds, penalty weights, TLD lists, spam keywords/bigrams, topical
keywords, placement rules. `link_firewall.py` loads it at runtime, so tuning
the firewall never requires touching code.

---

## 5. Monitoring script

See [`link_firewall.py`](link_firewall.py) (header docstring has full usage)
and `sample_backlinks.csv` for the input format. Highlights:

- Accepts Ahrefs CSV exports or plain domain lists
- Stdlib only — no paid APIs; uses DR/traffic columns only if present
- Outputs console report + optional CSV + ready-to-paste disavow lines
- `--update-blacklist` grows `blacklist_domains.txt` automatically
- Exit code 1 when rejects are found (cron/CI friendly)

---

## 6. Ongoing protection plan

**Weekly (~10 min)**
1. Ahrefs free Backlink Checker → note any new referring domains.
2. Paste new domains into a text file → `python3 link_firewall.py new.txt`.
3. REJECTs: append to `blacklist_domains.txt` (`--update-blacklist`) and to a
   pending-disavow list. REVIEWs: 60-second manual look (real site? real
   content? how did the link appear?).

**Monthly (~30 min)**
4. GSC → Links → Top linking sites: export, run through the script.
5. Merge accumulated REJECTs into `disavow.txt`, re-upload the full file.
6. Ahrefs Website Authority Checker: log DR + referring-domain counts in a
   simple spreadsheet to see the trend line.
7. Check GSC → Security & Manual Actions (should always be "No issues").

**Quarterly (~1 hour)**
8. Full profile audit: recheck borderline domains, prune the disavow file of
   anything that proved legitimate, review firewall config against new spam
   patterns you're seeing (spammers rotate TLDs — update `tld_blacklist`).
9. Review anchor-text distribution in GSC → Links → Top linking text for
   unnatural commercial anchors.

**Manual review criteria for anything the script flags REVIEW:**
real content written by humans; a plausible reason to link to you; traffic in
Ahrefs; site older than a year; no "buy links / increase DA" offers anywhere
on it. Two or more failures → treat as REJECT.

---

## 7. Positive link-building for a Laos / SEA digital agency

1. **Local business press & directories**: Laotian Times, Vientiane Times,
   Laos Chamber of Commerce & Industry, ASEAN business portals — company
   profile, expert commentary, event coverage.
2. **Original data / research**: publish a yearly "State of Digital Marketing
   in Laos" report (internet usage, ad costs, social platform share). Data
   gets cited by regional media, bloggers, and academics — the strongest
   natural link magnet available in an under-covered market.
3. **Regional marketing publications**: contribute expert articles to
   Tech in Asia, Marketing in Asia, e27, Marketing Interactive — genuine
   editorial guest content (not paid guest posts).
4. **Partnerships & case studies with real clients**: co-published case
   studies on client sites, chambers, and industry associations in Laos,
   Thailand, Vietnam.
5. **Speaking / community**: local startup events, university guest lectures
   (National University of Laos), webinars with regional co-hosts — event
   pages and recap posts link naturally.
6. **HARO-style expert quotes**: respond to journalist requests (Connectively/
   Qwoted/Featured, SourceBottle for APAC) on SEO, AI marketing, SEA digital
   trends.
7. **Free tools & resources**: a Lao/English marketing glossary, local SEO
   checklist for Lao businesses, or a simple ROI calculator — linkable assets
   that regional bloggers and trainers reference.

Avoid entirely: bought link packages, Fiverr/marketplace links, "guest post
services", PBNs, reciprocal link exchanges — one cheap shortcut recreates the
exact profile this toolkit just cleaned up.

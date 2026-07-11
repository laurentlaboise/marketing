#!/usr/bin/env python3
"""Patch glossary articles: branded share icons + sliding admin contact form."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GLOSSARY = ROOT / "en/resources/glossary"
SEED = json.loads((ROOT / "wts-admin/database/glossary_seed_data.json").read_text())

# Map article filename -> term
file_to_term: dict[str, str] = {}
for t in SEED:
    link = t.get("article_link") or ""
    if "/glossary/" in link:
        file_to_term[link.rstrip("/").split("/")[-1]] = t["term"]

SHARE_CSS_OLD = re.compile(
    r"\.share-dock \.share-btn\.fb\{[^}]+\}"
    r"[\s\S]*?"
    r"\.share-dock \.share-btn\.native\{[^}]+\}",
    re.M,
)

SHARE_CSS_NEW = """\
.share-dock .share-btn.fb,
.share-dock .share-btn.x,
.share-dock .share-btn.li,
.share-dock .share-btn.wa,
.share-dock .share-btn.tg,
.share-dock .share-btn.copy{background:#1e3a5f}
.share-dock .share-btn.native{background:#d62b83}
.share-dock .share-btn i{color:#fff!important;font-size:1em;line-height:1}
.share-dock .share-btn:hover,.share-dock .share-btn:focus{background:#d62b83;color:#fff!important}
.share-dock .share-btn.native:hover{background:#1e3a5f}"""

SLIDE_CSS = """
/* Sliding contact form connected to admin form_type=contact */
.wts-slide-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:1200;opacity:0;visibility:hidden;transition:opacity .3s,visibility .3s}
.wts-slide-overlay.is-open{opacity:1;visibility:visible}
.wts-slide-panel{position:fixed;top:0;right:0;height:100%;width:min(420px,100vw);background:#fff;z-index:1201;transform:translateX(100%);transition:transform .35s ease;box-shadow:-12px 0 32px rgba(15,23,42,.2);display:flex;flex-direction:column}
.wts-slide-panel.is-open{transform:translateX(0)}
.wts-slide-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;background:#1e3a5f;color:#fff}
.wts-slide-head h2{margin:0;font-size:1.15rem;color:#fff;border:0;padding:0}
.wts-slide-close{background:transparent;border:0;color:#fff;font-size:1.5rem;cursor:pointer;line-height:1;padding:4px 8px}
.wts-slide-body{padding:20px;overflow:auto;flex:1;-webkit-overflow-scrolling:touch}
.wts-slide-body .form-group{margin-bottom:14px}
.wts-slide-body label{display:block;font-weight:600;font-size:.9rem;margin-bottom:6px;color:#1e3a5f}
.wts-slide-body input,.wts-slide-body select,.wts-slide-body textarea{width:100%;padding:12px 14px;border:1px solid #d1d5db;border-radius:8px;font:inherit}
.wts-slide-body textarea{min-height:110px;resize:vertical}
.wts-slide-body .btn-submit{width:100%;padding:14px;background:#d62b83;color:#fff;border:0;border-radius:10px;font-weight:700;font-size:1rem;cursor:pointer;margin-top:8px}
.wts-slide-body .form-status{margin-top:12px;font-size:.95rem}
.wts-slide-body .form-status.ok{color:#047857}
.wts-slide-body .form-status.err{color:#b91c1c}
.cta button.cta-team-btn{background:none;border:0;color:#fff;font:inherit;font-weight:800;text-decoration:underline;text-underline-offset:3px;cursor:pointer;padding:0;margin:0 4px}
"""


def contact_panel(term: str, page_url: str) -> str:
    term_js = json.dumps(term)
    page_js = json.dumps(page_url)
    msg = (
        f"I read the glossary article on {term} and would like help implementing this for my business."
    )
    # escape for HTML textarea
    msg_html = (
        msg.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    return f"""
  <div class="wts-slide-overlay" id="team-form-overlay" hidden></div>
  <aside class="wts-slide-panel" id="team-form-panel" aria-hidden="true" role="dialog" aria-labelledby="team-form-title">
    <div class="wts-slide-head">
      <h2 id="team-form-title">Talk to our team</h2>
      <button type="button" class="wts-slide-close" id="team-form-close" aria-label="Close">&times;</button>
    </div>
    <div class="wts-slide-body">
      <p style="margin-top:0;color:#555">Connected to the WordsThatSells admin contact form. We reply within one business day.</p>
      <form id="team-contact-form">
        <div class="form-group"><label for="tc-name">Your name</label>
          <input id="tc-name" name="name" type="text" required placeholder="Full name" autocomplete="name"></div>
        <div class="form-group"><label for="tc-email">Work email</label>
          <input id="tc-email" name="email" type="email" required placeholder="you@company.com" autocomplete="email"></div>
        <div class="form-group"><label for="tc-company">Company</label>
          <input id="tc-company" name="company" type="text" placeholder="Business name (optional)"></div>
        <div class="form-group"><label for="tc-phone">Phone / WhatsApp</label>
          <input id="tc-phone" name="phone" type="tel" placeholder="+856 … (optional)" autocomplete="tel"></div>
        <div class="form-group"><label for="tc-service">What do you need help with?</label>
          <select id="tc-service" name="service" required>
            <option value="SEO &amp; local visibility" selected>SEO &amp; local visibility</option>
            <option value="Content &amp; brand storytelling">Content &amp; brand storytelling</option>
            <option value="Social media growth">Social media growth</option>
            <option value="Website / landing pages">Website / landing pages</option>
            <option value="Marketing automation &amp; AI tools">Marketing automation &amp; AI tools</option>
            <option value="Full digital growth program">Full digital growth program</option>
            <option value="Not sure — advise me">Not sure — advise me</option>
          </select></div>
        <div class="form-group"><label for="tc-message">How can we help?</label>
          <textarea id="tc-message" name="message" required>{msg_html}</textarea></div>
        <button type="submit" class="btn-submit">Send message</button>
        <p class="form-status" id="tc-status" role="status" aria-live="polite"></p>
      </form>
    </div>
  </aside>
  <script>
  (function(){{
    var overlay=document.getElementById('team-form-overlay');
    var panel=document.getElementById('team-form-panel');
    var openBtn=document.getElementById('open-team-form');
    var closeBtn=document.getElementById('team-form-close');
    var form=document.getElementById('team-contact-form');
    var statusEl=document.getElementById('tc-status');
    function openPanel(){{overlay.hidden=false;overlay.classList.add('is-open');panel.classList.add('is-open');panel.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';}}
    function closePanel(){{overlay.classList.remove('is-open');panel.classList.remove('is-open');panel.setAttribute('aria-hidden','true');document.body.style.overflow='';setTimeout(function(){{overlay.hidden=true;}},300);}}
    if(openBtn) openBtn.addEventListener('click', openPanel);
    if(closeBtn) closeBtn.addEventListener('click', closePanel);
    if(overlay) overlay.addEventListener('click', closePanel);
    document.addEventListener('keydown', function(e){{ if(e.key==='Escape') closePanel(); }});
    if(form){{
      form.addEventListener('submit', function(e){{
        e.preventDefault();
        statusEl.textContent='Sending…'; statusEl.className='form-status';
        var fd=new FormData(form);
        var payload={{
          form_type:'contact',
          name:fd.get('name'),
          email:fd.get('email'),
          company:fd.get('company')||'',
          phone:fd.get('phone')||'',
          message:fd.get('message')||'',
          metadata:{{source:'glossary-article',term:{term_js},page:{page_js},service:fd.get('service')||'',goal:'Higher search rankings'}}
        }};
        fetch('https://admin.wordsthatsells.website/api/public/submissions',{{
          method:'POST',
          headers:{{'Content-Type':'application/json','Accept':'application/json'}},
          body:JSON.stringify(payload)
        }}).then(function(r){{return r.json().then(function(j){{return {{ok:r.ok,j:j}};}});}})
          .then(function(res){{
            if(res.ok && res.j && res.j.success!==false){{
              statusEl.textContent=(res.j.message||'Thank you! We received your message and will reply within one business day.');
              statusEl.className='form-status ok'; form.reset();
            }} else {{
              statusEl.textContent=(res.j&&res.j.error)?res.j.error:'Something went wrong. Please try WhatsApp.';
              statusEl.className='form-status err';
            }}
          }})
          .catch(function(){{
            statusEl.textContent='Network error. WhatsApp +856 20 5552 8034';
            statusEl.className='form-status err';
          }});
      }});
    }}
  }})();
  </script>
"""


def patch_file(path: Path) -> bool:
    t = path.read_text(encoding="utf-8")
    original = t  # for change detection
    term = file_to_term.get(path.name, path.stem.replace("-", " ").title())
    page_url = f"https://wordsthatsells.website/en/resources/glossary/{path.name}"

    # 1) Uniform branded share colors
    t2, n = SHARE_CSS_OLD.subn(SHARE_CSS_NEW, t, count=1)
    if n:
        t = t2
    else:
        # force all platform colors to navy
        t = re.sub(r"\.share-dock \.share-btn\.fb\{background:[^}]+\}", ".share-dock .share-btn.fb{background:#1e3a5f}", t)
        t = re.sub(r"\.share-dock \.share-btn\.x\{background:[^}]+\}", ".share-dock .share-btn.x{background:#1e3a5f}", t)
        t = re.sub(r"\.share-dock \.share-btn\.li\{background:[^}]+\}", ".share-dock .share-btn.li{background:#1e3a5f}", t)
        t = re.sub(r"\.share-dock \.share-btn\.wa\{background:[^}]+\}", ".share-dock .share-btn.wa{background:#1e3a5f}", t)
        t = re.sub(r"\.share-dock \.share-btn\.tg\{background:[^}]+\}", ".share-dock .share-btn.tg{background:#1e3a5f}", t)
        t = re.sub(r"\.share-dock \.share-btn\.copy\{background:[^}]+\}", ".share-dock .share-btn.copy{background:#1e3a5f}", t)
        if ".share-dock .share-btn i{" not in t:
            t = t.replace(
                ".share-dock .share-btn.native{background:#d62b83}",
                ".share-dock .share-btn.native{background:#d62b83}\n.share-dock .share-btn i{color:#fff!important}",
            )

    # 2) CTA white text
    t = re.sub(
        r"\.cta\{[^}]+\}(?:\s*\.cta p\{[^}]+\})?(?:\s*\.cta a\{[^}]+\})?(?:\s*\.cta a:hover\{[^}]+\})?",
        ".cta{margin:48px 0;padding:32px 28px;background:#d62b83;color:#ffffff;border-radius:14px;text-align:center;box-shadow:0 10px 24px rgba(214,43,131,.35);font-weight:600}\n.cta p{color:#ffffff}\n.cta a,.cta button.cta-team-btn{color:#ffffff;font-weight:800;text-decoration:underline;text-underline-offset:3px;background:none;border:0;font:inherit;cursor:pointer;padding:0;margin:0 4px}\n.cta a:hover,.cta button.cta-team-btn:hover{color:#ffffff;opacity:.95}",
        t,
        count=1,
    )

    # 3) Slide CSS
    if "wts-slide-panel" not in t:
        t = t.replace("</style>", SLIDE_CSS + "\n</style>", 1)

    # 4) CTA talk to team -> button
    t = re.sub(
        r'<a href="https://wordsthatsells\.website/en/contact/?"[^>]*>Talk to our team</a>',
        '<button type="button" class="cta-team-btn" id="open-team-form">Talk to our team</button>',
        t,
        count=1,
    )
    # also if already different
    if "open-team-form" not in t and "Talk to our team" in t:
        t = t.replace(
            "Talk to our team",
            '</a><button type="button" class="cta-team-btn" id="open-team-form">Talk to our team</button><a href="#" style="display:none">',
            1,
        )

    # 5) Contact panel once
    if "wts-slide-panel" not in t or "team-contact-form" not in t:
        panel = contact_panel(term, page_url)
        # insert before footer or before </body>
        if "share-dock" in t:
            # after share dock script end, before footer
            idx = t.rfind("</script>")
            if idx > 0 and "share-dock" in t[max(0, idx - 800) : idx]:
                # find last share-related script
                pass
        if "team-form-panel" not in t:
            if "</body>" in t:
                t = t.replace("</body>", panel + "\n</body>", 1)
            else:
                t += panel

    if t != original:
        path.write_text(t, encoding="utf-8")
        return True
    return False


def main() -> None:
    n = 0
    for p in sorted(GLOSSARY.glob("*.html")):
        if p.name == "index.html":
            continue
        if patch_file(p):
            n += 1
    sample = (GLOSSARY / "backlinks-building-strategy-2026.html").read_text()
    print(
        f"patched={n} navy_icons={'#1e3a5f' in sample} slide={'team-contact-form' in sample} "
        f"open_btn={'open-team-form' in sample} submit={'api/public/submissions' in sample} "
        f"white_cta={'color:#ffffff' in sample}"
    )


if __name__ == "__main__":
    main()

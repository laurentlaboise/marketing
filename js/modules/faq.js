// js/modules/faq.js
import { revealObserver } from './ui.js';

// FAQ content is admin-managed (wts-admin → faqs.json → scripts/inject-faqs.js).
// The bake writes the pinned, crawlable items as static <details> and embeds
// the page's remaining pool in a <script type="application/json" id="faq-pool">
// data island: { lang, items: [{ slug, q, a, lang }] }. Answer HTML is
// sanitized server-side at save and at bake; `lang` differs from the page
// language only for English-fallback pool entries.

function readPool() {
  const el = document.getElementById('faq-pool');
  if (!el) return null;
  try {
    const data = JSON.parse(el.textContent);
    return data && Array.isArray(data.items) ? data : null;
  } catch (e) {
    return null;
  }
}

// The island carries answers as a structured node tree, never as HTML —
// the bake step (scripts/inject-faqs.js) decomposes the sanitized markup
// into { t: tag, href?, c: [child|string...] } nodes. Rendering walks the
// tree with createElement/createTextNode against a fixed tag allowlist, so
// the browser never re-parses CMS text as HTML at all.
const ALLOWED_ANSWER_TAGS = new Set(['a', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'br']);

function renderAnswerNodes(nodes, parent) {
  if (!Array.isArray(nodes)) return;
  nodes.forEach((node) => {
    if (typeof node === 'string') {
      parent.appendChild(document.createTextNode(node));
      return;
    }
    if (!node || !ALLOWED_ANSWER_TAGS.has(node.t)) return;
    const el = document.createElement(node.t);
    if (node.t === 'a' && typeof node.href === 'string' && /^(\/|https:\/\/)/.test(node.href)) {
      el.setAttribute('href', node.href);
    }
    if (node.t !== 'br') renderAnswerNodes(node.c, el);
    parent.appendChild(el);
  });
}

export function initFaqSection() {
  const faqList = document.getElementById('faq-list');
  const generateFaqBtn = document.getElementById('generate-faq-btn');
  // The list is required; the "Ask another" button is optional (some pages,
  // e.g. resources, render the accordion without it).
  if (!faqList) return;

  const pool = readPool();
  const items = pool ? pool.items : [];
  const used = new Set();
  // Server-rendered (pinned) items carry id="faq-<slug>" — never re-add them.
  faqList.querySelectorAll('details[id^="faq-"]').forEach((el) => {
    used.add(el.id.slice('faq-'.length));
  });

  function addFaqToDom(item) {
    const details = document.createElement('details');
    details.className = 'accordion-item reveal';
    details.id = `faq-${item.slug}`;
    if (pool && item.lang && item.lang !== pool.lang) {
      details.setAttribute('lang', item.lang); // English fallback on a localized page
    }
    const summary = document.createElement('summary');
    summary.className = 'accordion-summary';
    const heading = document.createElement('h3');
    heading.textContent = item.q;
    const icon = document.createElement('i');
    icon.className = 'fas fa-chevron-down icon';
    icon.setAttribute('aria-hidden', 'true');
    summary.append(heading, icon);
    const content = document.createElement('div');
    content.className = 'accordion-content';
    renderAnswerNodes(item.tree, content);
    details.append(summary, content);
    faqList.appendChild(details);
    revealObserver.observe(details); // animate newly added item
  }

  const available = () => items.filter((item) => !used.has(item.slug));

  function addRandomFaq(scrollTo) {
    const pick = available();
    if (pick.length === 0) return false;
    const item = pick[Math.floor(Math.random() * pick.length)];
    used.add(item.slug);
    addFaqToDom(item);
    if (scrollTo) {
      faqList.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return true;
  }

  // Pages with no pinned items (e.g. resources) get an initial random set
  // from the pool, preserving the long-standing shuffled-on-load behavior.
  if (faqList.querySelectorAll('details').length === 0) {
    for (let i = 0; i < 5 && addRandomFaq(false); i++);
  }

  if (generateFaqBtn) {
    if (available().length === 0) {
      generateFaqBtn.style.display = 'none';
      return;
    }
    generateFaqBtn.addEventListener('click', () => {
      if (!addRandomFaq(true) || available().length === 0) {
        generateFaqBtn.style.display = 'none';
      }
    });
  }
}

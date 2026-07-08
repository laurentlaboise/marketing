/**
 * Footer Loader — admin-managed footer content
 *
 * Self-contained IIFE that fills the existing site footer from the backend so
 * the link columns, social links, contact details and copyright can be edited
 * in the admin (Connections → Menu Manager / Footer Settings) instead of in HTML.
 *
 * It enhances the existing `<footer class="footer">` in place, reusing the same
 * CSS classes so styling is unchanged. The logo and brand paragraph are left
 * untouched. Any region with no backend data keeps its existing static markup,
 * so this is safe to include before anything is configured.
 *
 * Usage: <script src="/js/services/footer-loader.js"></script>
 */
(function () {
  'use strict';

  var API_BASE = 'https://admin.wordsthatsells.website/api/public';

  function init() {
    var footer = document.querySelector('footer.footer');
    if (!footer) return;

    fetch(API_BASE + '/footer')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || data.error) return;
        renderSocial(footer, data.social);
        renderGrid(footer, data.columns, data.contact);
        renderBottom(footer, data.legal, data.copyright);
      })
      .catch(function () {
        // Leave the static footer in place.
      });
  }

  // ── Social links ───────────────────────────────────────────

  var SOCIAL = [
    { key: 'instagram', icon: 'fab fa-instagram', label: 'Instagram' },
    { key: 'linkedin', icon: 'fab fa-linkedin', label: 'LinkedIn' },
    { key: 'facebook', icon: 'fab fa-facebook-square', label: 'Facebook' },
    { key: 'twitter', icon: 'fab fa-twitter-square', label: 'Twitter' },
    { key: 'youtube', icon: 'fab fa-youtube-square', label: 'YouTube' }
  ];

  function renderSocial(footer, social) {
    if (!social) return;
    var present = SOCIAL.filter(function (s) { return social[s.key]; });
    if (!present.length) return;

    var container = footer.querySelector('.social-links');
    if (!container) return;
    container.innerHTML = '';
    present.forEach(function (s) {
      var a = document.createElement('a');
      a.href = social[s.key];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.setAttribute('aria-label', 'Visit our ' + s.label);
      var i = document.createElement('i');
      i.className = s.icon;
      a.appendChild(i);
      container.appendChild(a);
    });
  }

  // ── Link columns + contact column ──────────────────────────

  function renderGrid(footer, columns, contact) {
    if (!Array.isArray(columns) || columns.length === 0) return;
    var grid = footer.querySelector('.footer-grid');
    if (!grid) return;

    grid.innerHTML = '';

    var contactCol = buildContactColumn(contact);
    if (contactCol) grid.appendChild(contactCol);

    columns.forEach(function (col) {
      grid.appendChild(buildLinkColumn(col));
    });
  }

  function buildContactColumn(contact) {
    if (!contact) return null;
    var hasAny = contact.address || contact.maps_url || contact.whatsapp || contact.email;
    if (!hasAny) return null;

    var col = column('Contact Us');
    var ul = col.querySelector('.footer-list');

    if (contact.address) {
      ul.appendChild(contactItem('fas fa-map-marker-alt', multiline(contact.address)));
    }
    if (contact.maps_url) {
      ul.appendChild(contactItem('fab fa-google', link(contact.maps_url, 'Find us on Google', true)));
    }
    if (contact.whatsapp) {
      var digits = contact.whatsapp.replace(/[^0-9]/g, '');
      ul.appendChild(contactItem('fab fa-whatsapp', link('https://wa.me/' + digits, contact.whatsapp, true)));
    }
    if (contact.email) {
      ul.appendChild(contactItem('fas fa-envelope', link('mailto:' + contact.email, contact.email, false)));
    }
    return col;
  }

  function buildLinkColumn(col) {
    var el = column(col.label);
    var ul = el.querySelector('.footer-list');
    (col.children || []).forEach(function (child) {
      var li = document.createElement('li');
      li.appendChild(link(child.url || '#', child.label, child.open_in_new_tab));
      ul.appendChild(li);
    });
    return el;
  }

  function column(heading) {
    var div = document.createElement('div');
    div.className = 'footer-column';
    var h3 = document.createElement('h3');
    h3.className = 'footer-heading';
    h3.textContent = heading;
    var ul = document.createElement('ul');
    ul.className = 'footer-list';
    div.appendChild(h3);
    div.appendChild(ul);
    return div;
  }

  function contactItem(iconClass, contentNode) {
    var li = document.createElement('li');
    li.className = 'footer-contact-item';
    var i = document.createElement('i');
    i.className = iconClass;
    li.appendChild(i);
    li.appendChild(contentNode);
    return li;
  }

  // ── Bottom bar (legal links + copyright) ───────────────────

  function renderBottom(footer, legal, copyright) {
    var hasLegal = Array.isArray(legal) && legal.length > 0;
    if (!hasLegal && !copyright) return;

    var bottom = footer.querySelector('.footer-bottom');
    if (!bottom) return;
    bottom.innerHTML = '';

    if (hasLegal) {
      var legalDiv = document.createElement('div');
      legalDiv.className = 'footer-legal';
      legal.forEach(function (item) {
        legalDiv.appendChild(link(item.url || '#', item.label, item.open_in_new_tab));
      });
      bottom.appendChild(legalDiv);
    }

    if (copyright) {
      var p = document.createElement('p');
      p.appendChild(multiline(copyright));
      bottom.appendChild(p);
    }
  }

  // ── Helpers ────────────────────────────────────────────────

  function link(href, text, newTab) {
    var a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    if (newTab) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    return a;
  }

  // Build a text fragment that preserves line breaks as <br>.
  function multiline(text) {
    var frag = document.createDocumentFragment();
    var lines = String(text).split('\n');
    lines.forEach(function (line, idx) {
      if (idx > 0) frag.appendChild(document.createElement('br'));
      frag.appendChild(document.createTextNode(line));
    });
    // Wrap in a span so callers can append a single node.
    var span = document.createElement('span');
    span.appendChild(frag);
    return span;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

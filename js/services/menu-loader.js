/**
 * Menu Loader — admin-managed top navigation / footer menus
 *
 * Self-contained IIFE that renders backend-managed menus into any mount point
 * marked with `data-wts-menu="<location>"` (e.g. "header" or "footer").
 *
 * Usage:
 *   <nav data-wts-menu="header"></nav>
 *   <script src="/js/services/menu-loader.js"></script>
 *
 * Each mount point is populated with a <ul class="wts-menu"> whose items link to
 * the configured URLs. Items with children render as a dropdown. If no menu is
 * configured for a location (or the API is unreachable) the mount is left
 * untouched, so existing static markup placed inside it acts as a fallback.
 */
(function () {
  'use strict';

  var API_BASE = 'https://admin.wordsthatsells.website/api/public';

  function init() {
    var mounts = document.querySelectorAll('[data-wts-menu]');
    if (!mounts.length) return;

    // De-duplicate locations so we only fetch each menu once.
    var locations = {};
    Array.prototype.forEach.call(mounts, function (el) {
      var loc = el.getAttribute('data-wts-menu') || 'header';
      (locations[loc] = locations[loc] || []).push(el);
    });

    Object.keys(locations).forEach(function (loc) {
      fetch(API_BASE + '/menu?location=' + encodeURIComponent(loc))
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (tree) {
          if (!Array.isArray(tree) || tree.length === 0) return;
          locations[loc].forEach(function (el) {
            el.innerHTML = '';
            el.appendChild(buildMenu(tree));
            el.setAttribute('data-wts-menu-loaded', 'true');
          });
        })
        .catch(function () {
          // Silently leave the static fallback markup in place.
        });
    });
  }

  function buildMenu(tree) {
    var ul = document.createElement('ul');
    ul.className = 'wts-menu';
    tree.forEach(function (node) {
      ul.appendChild(buildItem(node));
    });
    return ul;
  }

  function buildItem(node) {
    var li = document.createElement('li');
    li.className = 'wts-menu-item' + (node.children && node.children.length ? ' has-dropdown' : '');
    if (node.css_class) li.className += ' ' + node.css_class;

    var a = document.createElement('a');
    a.className = 'wts-menu-link';
    a.href = node.url || '#';
    if (node.open_in_new_tab) {
      a.target = '_blank';
      a.rel = 'noopener';
    }
    if (node.icon_class) {
      var icon = document.createElement('i');
      icon.className = node.icon_class;
      a.appendChild(icon);
      a.appendChild(document.createTextNode(' '));
    }
    a.appendChild(document.createTextNode(node.label || ''));
    li.appendChild(a);

    if (node.children && node.children.length) {
      var sub = document.createElement('ul');
      sub.className = 'wts-menu-dropdown';
      node.children.forEach(function (child) {
        sub.appendChild(buildItem(child));
      });
      li.appendChild(sub);
    }
    return li;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

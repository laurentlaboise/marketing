// WTS Admin - Main JavaScript

// Attach the CSRF token (from the <meta> tag rendered by partials/head.ejs)
// to every same-origin mutating fetch, so admin XHR calls pass the
// server-side CSRF check without each call site handling it.
(function () {
  const meta = document.querySelector('meta[name="csrf-token"]');
  const token = meta && meta.content;
  if (!token || !window.fetch) return;
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      const sameOrigin = url.startsWith('/')
        ? !url.startsWith('//')
        : url.startsWith(window.location.origin + '/');
      if (sameOrigin && method !== 'GET' && method !== 'HEAD') {
        init = init || {};
        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
        if (!headers.has('X-CSRF-Token')) headers.set('X-CSRF-Token', token);
        init.headers = headers;
      }
    } catch (e) {
      // Never block the request because of header plumbing
    }
    return originalFetch.call(this, input, init);
  };
})();

// Body scroll lock helpers (iOS-safe)
let _scrollY = 0;
function lockBody() {
  _scrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${_scrollY}px`;
  document.body.style.width = '100%';
  document.body.style.overflow = 'hidden';
}
function unlockBody() {
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  document.body.style.overflow = '';
  window.scrollTo(0, _scrollY);
}

document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  initDropdowns();
  initSearch();
  initCallButton();
  initMobileSearch();
  initAlerts();
  initSubmenuToggle();
  initRailToggle();
  initFormValidation();
  initConfirmDelete();
  initCopyCdnUrl();
  initNotifications();
  initKeyboardShortcuts();
  initLazyLoading();
});

// Sidebar functionality
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const sidebarToggle = document.getElementById('sidebarToggle');

  const openSidebar = () => {
    sidebar.classList.add('open');
    overlay.classList.add('active');
    if (mobileMenuBtn) mobileMenuBtn.classList.add('active');
    lockBody();
  };

  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', openSidebar);
  }

  // Bottom dock "More" opens the same drawer.
  const dockMore = document.getElementById('dockMore');
  if (dockMore) {
    dockMore.addEventListener('click', openSidebar);
  }

  if (overlay) {
    overlay.addEventListener('click', closeSidebar);
  }

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', closeSidebar);
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
    if (mobileMenuBtn) mobileMenuBtn.classList.remove('active');
    unlockBody();
  }

  // Close sidebar on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSidebar();
    }
  });
}

// Operate accordion: one section open at a time per accordion namespace
// (data-accordion), so the column always fits one viewport. The active
// page's section renders open server-side and always wins; otherwise the
// last manually opened section is restored.
function initSubmenuToggle() {
  const items = document.querySelectorAll('.nav-item[data-accordion]');
  const STORAGE_KEY = 'wts_sidebar_open_groups';

  const setOpen = (item, open) => {
    const toggle = item.querySelector('.submenu-toggle');
    const submenu = item.querySelector('.submenu');
    if (toggle) toggle.classList.toggle('active', open);
    if (submenu) submenu.classList.toggle('open', open);
  };

  const readState = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch (e) { return {}; }
  };
  const saveState = (state) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { /* ignore storage errors */ }
  };

  // Restore: within each namespace, open the saved group only when the
  // server didn't already open one (the active page's section).
  const state = readState();
  const namespaces = new Set();
  items.forEach((item) => namespaces.add(item.dataset.accordion));
  namespaces.forEach((ns) => {
    const group = Array.from(items).filter((i) => i.dataset.accordion === ns);
    const serverOpen = group.find((i) => i.querySelector('.submenu.open'));
    group.forEach((item) => {
      const open = serverOpen ? item === serverOpen : state[ns] === item.dataset.group;
      setOpen(item, open);
    });
  });

  items.forEach((item) => {
    const toggle = item.querySelector('.submenu-toggle');
    if (!toggle) return;
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      // A collapsed icon rail has no room for submenus — expand it and
      // open the section instead.
      if (document.body.classList.contains('rail-collapsed')) {
        document.body.classList.remove('rail-collapsed');
        try { localStorage.setItem('wts_sidebar_rail', '0'); } catch (err) { /* ignore */ }
      }
      const ns = item.dataset.accordion;
      const wasOpen = item.querySelector('.submenu') &&
        item.querySelector('.submenu').classList.contains('open');
      document.querySelectorAll('.nav-item[data-accordion="' + ns + '"]').forEach((sib) => {
        setOpen(sib, sib === item && !wasOpen);
      });
      const state = readState();
      state[ns] = wasOpen ? null : item.dataset.group;
      saveState(state);
    });
  });
}

// Desktop icon rail: collapse the sidebar to icons only; persisted per
// browser. Submenu clicks re-expand (handled above).
function initRailToggle() {
  const railToggle = document.getElementById('railToggle');
  if (!railToggle) return;
  const KEY = 'wts_sidebar_rail';
  const reflect = () => {
    const collapsed = document.body.classList.contains('rail-collapsed');
    const label = collapsed ? 'Expand menu' : 'Collapse menu';
    railToggle.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
    railToggle.setAttribute('aria-label', label);
    railToggle.setAttribute('title', label);
  };
  try {
    if (localStorage.getItem(KEY) === '1') document.body.classList.add('rail-collapsed');
  } catch (e) { /* ignore */ }
  reflect();
  railToggle.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('rail-collapsed');
    try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch (e) { /* ignore */ }
    reflect();
  });
}

// Dropdown menus
function initDropdowns() {
  const dropdowns = document.querySelectorAll('.user-dropdown');

  dropdowns.forEach(dropdown => {
    const btn = dropdown.querySelector('.user-dropdown-btn');
    const menu = dropdown.querySelector('.dropdown-menu');

    if (btn && menu) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('active');
      });
    }
  });

  // Close dropdowns on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu.active').forEach(menu => {
      menu.classList.remove('active');
    });
  });
}

// Global search (top bar): grouped type-ahead against /api/search.
// One wiring shared by the desktop header input and the mobile overlay.
// Response shape: { groups: [{ label, items: [{ title, meta, href }] }] }.
const SEARCH_GROUP_ICONS = {
  'Content': 'fa-file-alt',
  'Translations': 'fa-language',
  'Form Submissions': 'fa-envelope',
  'Leads': 'fa-address-book'
};

function setupSearchBox(form, input, resultsEl) {
  if (!form || !input || !resultsEl) return;

  let debounceTimer;
  let items = [];       // rendered result anchors, in visual order
  let activeIndex = -1; // keyboard highlight

  const close = () => {
    resultsEl.classList.remove('active');
    resultsEl.innerHTML = '';
    items = [];
    activeIndex = -1;
  };

  const setActive = (index) => {
    if (items.length === 0) return;
    activeIndex = (index + items.length) % items.length;
    items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
    items[activeIndex].scrollIntoView({ block: 'nearest' });
  };

  // DOM-API rendering: every user-influenced string lands in textContent,
  // never in markup.
  const render = (groups) => {
    resultsEl.innerHTML = '';
    items = [];
    activeIndex = -1;

    if (!groups || groups.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'search-empty';
      empty.textContent = 'No results found';
      resultsEl.appendChild(empty);
      resultsEl.classList.add('active');
      return;
    }

    groups.forEach((group) => {
      const label = document.createElement('div');
      label.className = 'search-group-label';
      label.textContent = group.label || '';
      resultsEl.appendChild(label);

      (group.items || []).forEach((item) => {
        const a = document.createElement('a');
        a.className = 'search-result-item';
        a.href = item.href || '#';
        const icon = document.createElement('i');
        icon.className = 'fas ' + (SEARCH_GROUP_ICONS[group.label] || 'fa-file');
        const body = document.createElement('div');
        const title = document.createElement('div');
        title.className = 'result-title';
        title.textContent = item.title || '';
        const meta = document.createElement('div');
        meta.className = 'result-type';
        meta.textContent = item.meta || '';
        body.appendChild(title);
        body.appendChild(meta);
        a.appendChild(icon);
        a.appendChild(body);
        resultsEl.appendChild(a);
        items.push(a);
      });
    });

    if (items.length > 0) setActive(0); // Enter opens the top hit by default
    resultsEl.classList.add('active');
  };

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = input.value.trim();
    if (query.length < 2) {
      close();
      return;
    }
    debounceTimer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.slice(0, 100))}`);
        const data = await response.json();
        if (input.value.trim() !== query) return; // stale response, newer keystrokes pending
        render(data.groups || []);
      } catch (error) {
        console.error('Search error:', error);
      }
    }, 250);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      close();
      return;
    }
    if (!resultsEl.classList.contains('active')) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(activeIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(activeIndex - 1);
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && items[activeIndex]) {
        e.preventDefault();
        window.location.href = items[activeIndex].href;
      }
    }
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!form.contains(e.target)) close();
  });

  // Never navigate to the raw JSON endpoint; Enter is handled above.
  form.addEventListener('submit', (e) => e.preventDefault());
}

function initSearch() {
  const form = document.getElementById('globalSearch');
  if (!form) return; // unauthenticated pages render no search box
  setupSearchBox(form, form.querySelector('.search-input'), document.getElementById('searchResults'));
}

// Video call button: create a Jitsi room, open it, and let the server
// notify the coordinators with the join link.
function initCallButton() {
  const btn = document.getElementById('startCallBtn');
  if (!btn) return;
  const fallback = document.getElementById('callLinkFallback');

  const showFallback = (roomUrl) => {
    if (!fallback) {
      alert('Pop-up blocked. Join link: ' + roomUrl);
      return;
    }
    fallback.innerHTML = '';
    const note = document.createElement('div');
    note.textContent = 'Pop-up blocked — open your call here:';
    const link = document.createElement('a');
    link.href = roomUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = roomUrl;
    fallback.appendChild(note);
    fallback.appendChild(link);
    fallback.classList.add('active');
  };

  document.addEventListener('click', (e) => {
    if (fallback && fallback.classList.contains('active') &&
        !fallback.contains(e.target) && !btn.contains(e.target)) {
      fallback.classList.remove('active');
    }
  });

  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      // X-CSRF-Token is attached by the global fetch wrapper above.
      const res = await fetch('/api/call-invite', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.roomUrl) {
        throw new Error(data.error || 'Failed to start the call');
      }
      const win = window.open(data.roomUrl, '_blank');
      if (win) {
        win.opener = null;
      } else {
        showFallback(data.roomUrl);
      }
    } catch (err) {
      alert(err.message || 'Failed to start the call');
    } finally {
      btn.disabled = false;
    }
  });
}

// Alert auto-dismiss
function initAlerts() {
  const alerts = document.querySelectorAll('.alert');

  alerts.forEach(alert => {
    setTimeout(() => {
      alert.style.opacity = '0';
      alert.style.transform = 'translateY(-10px)';
      setTimeout(() => alert.remove(), 300);
    }, 5000);
  });
}

// Form validation
function initFormValidation() {
  const forms = document.querySelectorAll('form[data-validate]');

  forms.forEach(form => {
    form.addEventListener('submit', (e) => {
      const requiredFields = form.querySelectorAll('[required]');
      let isValid = true;

      requiredFields.forEach(field => {
        if (!field.value.trim()) {
          isValid = false;
          field.classList.add('error');
          showFieldError(field, 'This field is required');
        } else {
          field.classList.remove('error');
          hideFieldError(field);
        }
      });

      if (!isValid) {
        e.preventDefault();
      }
    });
  });
}

// Confirm delete
function initConfirmDelete() {
  const deleteButtons = document.querySelectorAll('[data-confirm-delete]');

  deleteButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const message = btn.dataset.confirmDelete || 'Are you sure you want to delete this item?';
      if (!confirm(message)) {
        e.preventDefault();
      }
    });
  });

  // Generic (non-delete) confirmation prompts.
  document.querySelectorAll('[data-confirm]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (!confirm(btn.dataset.confirm || 'Are you sure?')) {
        e.preventDefault();
      }
    });
  });
}

// Helper functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showFieldError(field, message) {
  let error = field.nextElementSibling;
  if (!error || !error.classList.contains('field-error')) {
    error = document.createElement('span');
    error.className = 'field-error';
    field.parentNode.insertBefore(error, field.nextSibling);
  }
  error.textContent = message;
}

function hideFieldError(field) {
  const error = field.nextElementSibling;
  if (error && error.classList.contains('field-error')) {
    error.remove();
  }
}

// Bulk selection
function initBulkSelection(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;

  const selectAll = table.querySelector('.select-all');
  const checkboxes = table.querySelectorAll('.row-checkbox');

  if (selectAll) {
    selectAll.addEventListener('change', () => {
      checkboxes.forEach(cb => cb.checked = selectAll.checked);
      updateBulkActions();
    });
  }

  checkboxes.forEach(cb => {
    cb.addEventListener('change', updateBulkActions);
  });

  function updateBulkActions() {
    const selected = table.querySelectorAll('.row-checkbox:checked');
    const bulkActions = document.querySelector('.bulk-actions');
    if (bulkActions) {
      bulkActions.style.display = selected.length > 0 ? 'flex' : 'none';
      const count = bulkActions.querySelector('.selected-count');
      if (count) count.textContent = selected.length;
    }
  }
}

// Format date
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Copy CDN URL buttons
function initCopyCdnUrl() {
  document.querySelectorAll('.copy-cdn-url').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const url = btn.dataset.url;
      if (!url) return;
      navigator.clipboard.writeText(url).then(() => {
        const toast = document.getElementById('copyToast');
        if (toast) {
          toast.classList.add('show');
          setTimeout(() => toast.classList.remove('show'), 2000);
        }
        // Brief button feedback
        const icon = btn.querySelector('i');
        if (icon) {
          const orig = icon.className;
          icon.className = 'fas fa-check';
          setTimeout(() => { icon.className = orig; }, 1500);
        }
      });
    });
  });
}

// Notification bell dropdown
function initNotifications() {
  const btn = document.getElementById('notificationsBtn');
  const dropdown = document.getElementById('notifDropdown');
  const notifList = document.getElementById('notifList');
  const markAllBtn = document.getElementById('markAllReadBtn');

  if (!btn || !dropdown) return;

  let isOpen = false;
  let loaded = false;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    isOpen = !isOpen;
    dropdown.classList.toggle('active', isOpen);

    if (isOpen && !loaded) {
      loadNotifications();
      loaded = true;
    }
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (isOpen && !dropdown.contains(e.target) && !btn.contains(e.target)) {
      isOpen = false;
      dropdown.classList.remove('active');
    }
  });

  // Mark all read
  if (markAllBtn) {
    markAllBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await fetch('/api/notifications/mark-read', { method: 'POST' });
        // Remove badge
        const badge = btn.querySelector('.notification-badge');
        if (badge) badge.remove();
        // Update items
        dropdown.querySelectorAll('.notif-item.unread').forEach(item => {
          item.classList.remove('unread');
        });
        dropdown.querySelectorAll('.notif-icon').forEach(icon => {
          icon.style.background = '#d0eaf8';
          icon.style.color = '#1a6fa8';
        });
      } catch (err) {
        console.error('Failed to mark notifications as read', err);
      }
    });
  }

  // Category derived from each notification's link (payout wording wins
  // over the section prefix, so "/translations/payouts" files under
  // Payouts). Plain includes()/startsWith() — no regex on user data.
  function notifCategory(n) {
    const link = String(n.link || '').toLowerCase();
    const title = String(n.title || '').toLowerCase();
    if (link.includes('payout') || title.includes('payout')) return 'Payouts';
    if (link.startsWith('/translations')) return 'Localization';
    if (link.startsWith('/partners')) return 'Partners';
    if (link.startsWith('/workforce')) return 'Workforce';
    return 'System';
  }

  async function loadNotifications() {
    try {
      const res = await fetch('/api/notifications');
      const data = await res.json();
      if (!data.notifications || data.notifications.length === 0) {
        notifList.innerHTML = '<div class="notif-empty"><i class="fas fa-bell-slash"></i>No notifications yet</div>';
        return;
      }

      // Group items by category, keeping newest-first order inside each
      // group and ordering groups by their newest item (first appearance).
      const order = [];
      const grouped = {};
      data.notifications.forEach(n => {
        const cat = notifCategory(n);
        if (!grouped[cat]) {
          grouped[cat] = [];
          order.push(cat);
        }
        grouped[cat].push(n);
      });

      notifList.innerHTML = order.map(cat => {
        const header = `<div class="notif-group-label">${escapeHtml(cat)}</div>`;
        const items = grouped[cat].map(n => {
          const isUnread = !n.read;
          const link = n.link || '/webdev/submissions';
          return `<a href="${escapeHtml(link)}" class="notif-item ${isUnread ? 'unread' : ''}">
            <div class="notif-icon"><i class="fas fa-envelope"></i></div>
            <div class="notif-body">
              <div class="notif-title">${escapeHtml(n.title)}</div>
              <div class="notif-msg">${escapeHtml(n.message || '')}</div>
              <div class="notif-time">${timeAgo(n.created_at)}</div>
            </div>
          </a>`;
        }).join('');
        return header + items;
      }).join('');
    } catch (err) {
      notifList.innerHTML = '<div class="notif-empty">Failed to load notifications</div>';
    }
  }

  // Poll for new notifications every 60 seconds
  setInterval(async () => {
    try {
      const res = await fetch('/api/notifications');
      const data = await res.json();
      const count = data.unreadCount || 0;
      let badge = btn.querySelector('.notification-badge');
      if (count > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'notification-badge';
          btn.appendChild(badge);
        }
        badge.textContent = count > 99 ? '99+' : count;
      } else if (badge) {
        badge.remove();
      }
      // If dropdown is open, refresh the list
      if (isOpen) loadNotifications();
    } catch (err) { /* ignore polling errors */ }
  }, 60000);
}

// Format time ago
function timeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60
  };

  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
    }
  }

  return 'Just now';
}

// Mobile search overlay
function initMobileSearch() {
  const openBtn = document.getElementById('mobileSearchBtn');
  const overlay = document.getElementById('mobileSearchOverlay');
  const closeBtn = document.getElementById('mobileSearchClose');
  const searchInput = document.getElementById('mobileSearchInput');
  const searchResults = document.getElementById('mobileSearchResults');
  const searchForm = document.getElementById('mobileGlobalSearch');

  if (!openBtn || !overlay) return;

  openBtn.addEventListener('click', () => {
    overlay.classList.add('active');
    lockBody();
    setTimeout(() => searchInput?.focus(), 100);
  });

  function closeOverlay() {
    overlay.classList.remove('active');
    unlockBody();
  }

  if (closeBtn) closeBtn.addEventListener('click', closeOverlay);

  // Close on Escape
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeOverlay();
  });

  // Search wiring shared with the desktop box (grouped results,
  // debounce, keyboard navigation, Escape).
  setupSearchBox(searchForm, searchInput, searchResults);
}

// Keyboard shortcuts
function initKeyboardShortcuts() {
  // Ctrl+K / Cmd+K focuses the global search from anywhere — including
  // from inside other inputs, so it gets its own listener ahead of the
  // "ignore keystrokes in form fields" rule below.
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || (e.key !== 'k' && e.key !== 'K')) return;
    const desktopInput = document.querySelector('.header-search .search-input');
    const desktopVisible = desktopInput &&
      window.getComputedStyle(desktopInput.closest('.header-search')).display !== 'none';
    if (desktopVisible) {
      e.preventDefault();
      desktopInput.focus();
      desktopInput.select();
    } else if (document.getElementById('mobileSearchBtn')) {
      e.preventDefault();
      document.getElementById('mobileSearchBtn').click();
    }
    // No search box on this page (non-admin header): let the browser keep
    // its default Ctrl+K behavior.
  });

  document.addEventListener('keydown', (e) => {
    // Don't trigger when typing in inputs
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

    // '/' to focus search
    if (e.key === '/') {
      e.preventDefault();
      const searchInput = document.querySelector('.header-search .search-input');
      if (searchInput && window.getComputedStyle(searchInput.closest('.header-search')).display !== 'none') {
        searchInput.focus();
      } else {
        // On mobile, open the mobile search overlay
        document.getElementById('mobileSearchBtn')?.click();
      }
    }

    // Escape to close sidebar/modals
    if (e.key === 'Escape') {
      const mobileOverlay = document.getElementById('mobileSearchOverlay');
      if (mobileOverlay?.classList.contains('active')) {
        mobileOverlay.classList.remove('active');
        unlockBody();
        return;
      }
      // Close any open modals
      document.querySelectorAll('.modal-overlay').forEach(m => {
        m.style.display = 'none';
      });
    }
  });
}

// Lazy loading for images
function initLazyLoading() {
  document.querySelectorAll('.image-card-preview img, .image-grid img').forEach(img => {
    if (!img.loading) img.loading = 'lazy';
    if (!img.decoding) img.decoding = 'async';
  });
}

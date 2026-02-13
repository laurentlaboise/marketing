// WTS Admin - Main JavaScript

document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  initDropdowns();
  initSearch();
  initAlerts();
  initSubmenuToggle();
  initFormValidation();
  initConfirmDelete();
  initCopyCdnUrl();
  initNotifications();
});

// Sidebar functionality
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const sidebarToggle = document.getElementById('sidebarToggle');

  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
      sidebar.classList.add('open');
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    });
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
    document.body.style.overflow = '';
  }

  // Close sidebar on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSidebar();
    }
  });
}

// Submenu toggle
function initSubmenuToggle() {
  const submenuToggles = document.querySelectorAll('.submenu-toggle');

  submenuToggles.forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      const parent = toggle.closest('.nav-item');
      const submenu = parent.querySelector('.submenu');

      // Toggle active class
      toggle.classList.toggle('active');

      // Toggle submenu
      if (submenu) {
        submenu.classList.toggle('open');
      }

      // Close other submenus (optional - remove if you want multiple open)
      // document.querySelectorAll('.submenu.open').forEach(s => {
      //   if (s !== submenu) {
      //     s.classList.remove('open');
      //     s.closest('.nav-item').querySelector('.submenu-toggle').classList.remove('active');
      //   }
      // });
    });
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

// Global search
function initSearch() {
  const searchForm = document.getElementById('globalSearch');
  const searchInput = searchForm?.querySelector('.search-input');
  const searchResults = document.getElementById('searchResults');

  if (!searchInput || !searchResults) return;

  let debounceTimer;

  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    const query = e.target.value.trim();

    if (query.length < 2) {
      searchResults.classList.remove('active');
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();

        if (data.results && data.results.length > 0) {
          searchResults.innerHTML = data.results.map(item => {
            const typeIcons = {
              'article': 'fa-newspaper',
              'ai-tool': 'fa-robot',
              'glossary': 'fa-book',
              'product': 'fa-box'
            };
            const typeUrls = {
              'article': '/content/articles',
              'ai-tool': '/content/ai-tools',
              'glossary': '/content/glossary',
              'product': '/business/products'
            };
            return `
              <a href="${typeUrls[item.type]}/${item.id}/edit" class="search-result-item">
                <i class="fas ${typeIcons[item.type] || 'fa-file'}"></i>
                <div>
                  <div class="result-title">${escapeHtml(item.title)}</div>
                  <div class="result-type">${item.type}</div>
                </div>
              </a>
            `;
          }).join('');
          searchResults.classList.add('active');
        } else {
          searchResults.innerHTML = '<div class="search-result-item">No results found</div>';
          searchResults.classList.add('active');
        }
      } catch (error) {
        console.error('Search error:', error);
      }
    }, 300);
  });

  // Close search results on outside click
  document.addEventListener('click', (e) => {
    if (!searchForm.contains(e.target)) {
      searchResults.classList.remove('active');
    }
  });

  // Prevent form submission
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
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

  async function loadNotifications() {
    try {
      const res = await fetch('/api/notifications');
      const data = await res.json();
      if (!data.notifications || data.notifications.length === 0) {
        notifList.innerHTML = '<div class="notif-empty"><i class="fas fa-bell-slash"></i>No notifications yet</div>';
        return;
      }
      notifList.innerHTML = data.notifications.map(n => {
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

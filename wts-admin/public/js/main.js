// WTS Admin - Main JavaScript

document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  initDropdowns();
  initSearch();
  initAlerts();
  initSubmenuToggle();
  initFormValidation();
  initConfirmDelete();
});

/**
 * Initialize sidebar behavior: open/close controls, overlay activation, and Escape-key closing.
 *
 * Wires click handlers for the mobile menu button, overlay, and sidebar toggle to open and close
 * the sidebar, toggles the overlay, and disables body scrolling while the sidebar is open.
 */
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

  /**
   * Closes the sidebar, hides the overlay, and restores page scrolling.
   *
   * Removes the sidebar's `open` class, removes the overlay's `active` class,
   * and resets the document body's overflow style so the page can scroll again.
   */
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

/**
 * Initialize click handlers that toggle navigation submenus.
 *
 * Binds click listeners to elements with the `.submenu-toggle` class. On click, the handler prevents the default action, toggles the toggle element's `active` class, and toggles the nearest `.submenu` element's `open` class to show or hide the submenu.
 */
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

/**
 * Enables user dropdown behavior: toggles each dropdown's menu when its button is clicked and closes any open menus when clicking outside.
 *
 * This function binds click handlers to elements with the `.user-dropdown` structure (a `.user-dropdown-btn` and a `.dropdown-menu`) to control menu visibility.
 */
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

/**
 * Initializes the global search UI: wires input handling, debounced queries, result rendering, outside-click closing, and prevents form submission.
 *
 * Listens to the #globalSearch input and, when the query is at least 2 characters, performs a debounced request to /api/search?q=... and renders returned results into #searchResults (or a "No results found" message). Closes results when clicking outside the search form and prevents the search form from submitting.
 */
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

/**
 * Automatically hides and removes any elements with the `.alert` class.
 *
 * Schedules each alert to fade and slide out after 5 seconds, then removes it from the DOM 300ms after the animation starts.
 */
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

/**
 * Attach client-side required-field validation to forms marked with `data-validate`.
 *
 * On form submit, checks every `[required]` field: if a field is empty it adds the `error`
 * class and displays a "This field is required" message; if a field has a value it clears
 * any error state. Submission is prevented when any required field is empty.
 */
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

/**
 * Attaches click handlers to elements with `data-confirm-delete` that prompt the user for confirmation before proceeding.
 *
 * If the user cancels the confirmation dialog, the click's default action is prevented. */
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

/**
 * Escape a string for safe insertion into HTML.
 * @param {string} text - The text to escape.
 * @return {string} The HTML-escaped string safe for insertion into the DOM.
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Ensure a `.field-error` element immediately after the given field and set its text to the provided message.
 * @param {HTMLElement} field - The form field element to attach the error to.
 * @param {string} message - The error message to display.
 */
function showFieldError(field, message) {
  let error = field.nextElementSibling;
  if (!error || !error.classList.contains('field-error')) {
    error = document.createElement('span');
    error.className = 'field-error';
    field.parentNode.insertBefore(error, field.nextSibling);
  }
  error.textContent = message;
}

/**
 * Remove an adjacent `.field-error` element that follows the given form field, if present.
 * @param {HTMLElement} field - The form field element whose following sibling error message should be removed.
 */
function hideFieldError(field) {
  const error = field.nextElementSibling;
  if (error && error.classList.contains('field-error')) {
    error.remove();
  }
}

/**
 * Initialize bulk-selection UI for the table with the given id.
 *
 * Enables a ".select-all" checkbox to toggle all ".row-checkbox" items, updates the visibility of the global ".bulk-actions" container, and updates its ".selected-count" with the number of checked rows.
 * @param {string} tableId - ID of the table element to enable bulk selection for.
 */
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

  /**
   * Updates bulk action UI based on currently checked row checkboxes.
   *
   * Shows or hides the `.bulk-actions` element depending on whether any `.row-checkbox:checked`
   * exist within the scoped table and updates the `.selected-count` text with the number selected.
   */
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

/**
 * Format a date value into a short en-US date string.
 * @param {string|Date} dateString - A value accepted by the Date constructor (e.g., ISO string or Date).
 * @returns {string} The localized date, e.g. "Jan 2, 2023".
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Convert a date or timestamp into a human-friendly relative time string (e.g., "3 days ago").
 * @param {string|Date} dateString - A date string or Date object parseable by the JavaScript `Date` constructor.
 * @returns {string} A relative time such as "`3 days ago`", "`1 hour ago`", or "`Just now`".
 */
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
# Responsive Admin Design Plan — admin.wordsthatsells.website

## Current State Assessment

### Architecture
- **Stack**: Node.js/Express server with EJS templates, vanilla CSS (`style.css` at 2751 lines), vanilla JS (`main.js` at 446 lines)
- **Layout**: Fixed 280px sidebar + sticky 64px header + fluid main content area
- **Views**: ~65 EJS templates across auth, dashboard, content, business, social, webdev, images modules
- **Partials**: `head.ejs`, `header.ejs`, `sidebar.ejs`, `footer.ejs` — shared across all pages
- **Secondary CSS**: `automation-compiler.css` (tri-pane IDE layout)

### Current Responsive Coverage (Gaps Identified)
- **1024px breakpoint**: Sidebar collapses off-canvas, mobile menu button appears — **this works**
- **768px breakpoint**: Some grid adjustments (stats, campaigns, images, form-rows) — **partial**
- **480px breakpoint**: Only hides search bar and username — **minimal**
- **Missing entirely**: Fluid typography, touch target sizing, table-to-card morphing, sticky mobile actions, container queries, aspect-ratio CLS prevention, proper mobile form layouts, calendar mobile view, automation compiler responsive layout

### Key Files to Modify
| File | Role |
|------|------|
| `wts-admin/public/css/style.css` | Primary stylesheet — all responsive rules live here |
| `wts-admin/public/css/automation-compiler.css` | Tri-pane IDE — needs its own responsive strategy |
| `wts-admin/public/js/main.js` | Sidebar toggle, dropdowns, search — needs touch/keyboard enhancements |
| `wts-admin/src/views/partials/sidebar.ejs` | Navigation partial — needs close button for mobile |
| `wts-admin/src/views/partials/header.ejs` | Header partial — needs mobile search modal, touch-friendly actions |
| `wts-admin/src/views/partials/head.ejs` | `<head>` partial — already has viewport meta |
| Various list/form/detail EJS templates | Inline styles using `grid-template-columns` that need responsive overrides |

---

## Implementation Plan

### Phase 1: Fluid Spatial Architecture (CSS Foundation)

#### 1.1 — CSS Custom Properties for Fluid Scaling
**File**: `wts-admin/public/css/style.css` (`:root` block, lines 5-55)

Add fluid spacing and typography variables using `clamp()`:

```css
:root {
  /* Fluid Typography */
  --text-xs: clamp(0.7rem, 0.65rem + 0.25vw, 0.75rem);
  --text-sm: clamp(0.8rem, 0.75rem + 0.25vw, 0.875rem);
  --text-base: clamp(0.875rem, 0.825rem + 0.25vw, 1rem);
  --text-lg: clamp(1rem, 0.9rem + 0.5vw, 1.125rem);
  --text-xl: clamp(1.125rem, 1rem + 0.625vw, 1.5rem);
  --text-2xl: clamp(1.25rem, 1rem + 1.25vw, 1.875rem);
  --text-3xl: clamp(1.5rem, 1.125rem + 1.875vw, 2.25rem);

  /* Fluid Spacing */
  --space-xs: clamp(0.25rem, 0.2rem + 0.25vw, 0.5rem);
  --space-sm: clamp(0.5rem, 0.4rem + 0.5vw, 0.75rem);
  --space-md: clamp(0.75rem, 0.6rem + 0.75vw, 1.5rem);
  --space-lg: clamp(1rem, 0.75rem + 1.25vw, 2rem);
  --space-xl: clamp(1.5rem, 1rem + 2.5vw, 3rem);
}
```

**Apply fluid values** to:
- `.page-title` → `font-size: var(--text-2xl)` (currently hardcoded `24px`)
- `.page-content` → `padding: var(--space-lg)` (currently hardcoded `24px`)
- `.card-body` → `padding: var(--space-lg)` (currently hardcoded `24px`)
- `.card-header` → `padding: var(--space-md) var(--space-lg)` (currently `20px 24px`)
- `.stat-content h3` → `font-size: var(--text-2xl)` (currently `28px`)
- `.stats-grid` → `gap: var(--space-md)` (currently `20px`)
- All other hardcoded `padding`/`margin`/`font-size` values throughout

#### 1.2 — Container Queries for Modular Components
**File**: `wts-admin/public/css/style.css`

Add container query contexts to card parents and implement component-level breakpoints:

```css
/* Container contexts */
.page-content { container-type: inline-size; container-name: page; }
.card-body { container-type: inline-size; container-name: card; }
.stats-grid { container-type: inline-size; container-name: stats; }

/* Stats grid adapts to container, not viewport */
@container stats (max-width: 600px) {
  .stat-card { /* stack icon above text */ }
}
@container stats (max-width: 400px) {
  .stats-grid { grid-template-columns: 1fr; }
}

/* Campaign cards adapt to their container */
@container card (max-width: 400px) {
  .campaign-meta { flex-direction: column; gap: 8px; }
}
```

#### 1.3 — Content-Driven Grid Reflow
**File**: `wts-admin/public/css/style.css`

Replace hardcoded `minmax()` values in grid definitions with more adaptive values:

- `.stats-grid`: Change `minmax(200px, 1fr)` → `minmax(min(200px, 100%), 1fr)`
- `.campaign-grid`: Change `minmax(360px, 1fr)` → `minmax(min(340px, 100%), 1fr)`
- `.microsite-grid`: Change `minmax(380px, 1fr)` → `minmax(min(340px, 100%), 1fr)`
- `.image-grid`: Change `minmax(220px, 1fr)` → `minmax(min(180px, 100%), 1fr)`
- `.hashtag-grid`: Change `minmax(340px, 1fr)` → `minmax(min(300px, 100%), 1fr)`

Fix inline grid styles in EJS templates:
- `dashboard/index.ejs` line 141: `grid-template-columns: repeat(auto-fit, minmax(340px, 1fr))` → move to CSS class `.dashboard-cards-grid`
- `images/library.ejs` line 30: `grid-template-columns: 240px 1fr` → move to CSS class `.image-library-layout`

---

### Phase 2: Input & Interaction Agnosticism

#### 2.1 — Universal Hit Targets (44x44pt minimum)
**File**: `wts-admin/public/css/style.css`

Enforce minimum touch-friendly sizing:

```css
/* Universal minimum touch targets */
.btn, .nav-link, .dropdown-item, .pagination-btn,
.header-btn, .folder-nav-item, .detail-tab,
.image-card-actions .btn, .table-actions .btn {
  min-height: 44px;
  min-width: 44px;
}

.btn-sm {
  min-height: 44px;
  padding: 10px 16px;
}

.btn-icon {
  width: 44px;
  height: 44px;
}

.submenu a {
  min-height: 44px;
  display: flex;
  align-items: center;
}
```

#### 2.2 — Unified State Mapping (hover/focus/active parity)
**File**: `wts-admin/public/css/style.css`

Add `:focus-visible` and `:active` states to all interactive elements. Currently most only have `:hover`:

```css
/* Focus ring for keyboard navigation */
.btn:focus-visible,
.nav-link:focus-visible,
.form-input:focus-visible,
.dropdown-item:focus-visible,
.pagination-btn:focus-visible,
.header-btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

/* Active/pressed states for touch feedback */
.btn:active { transform: scale(0.97); }
.btn-primary:active { background: var(--primary-dark); transform: scale(0.97); }
.nav-link:active { background: rgba(255, 255, 255, 0.15); }

/* Isolate hover-only effects to pointer devices */
@media (hover: hover) {
  .image-card:hover .image-card-overlay { opacity: 1; }
  .image-card:hover .image-card-preview img { transform: scale(1.05); }
  .btn-primary:hover { transform: translateY(-2px); }
}

/* Make overlay controls always visible on touch devices */
@media (hover: none) {
  .image-card-overlay { opacity: 1; background: rgba(0,0,0,0.2); }
  .cal-add-btn { opacity: 1; }
  .image-select-grid { opacity: 1; }
  .folder-nav-item-wrapper .folder-actions { display: flex; }
}
```

#### 2.3 — Keyboard Shortcut Support
**File**: `wts-admin/public/js/main.js`

Add keyboard shortcuts for primary actions:

```javascript
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.key === '/') {
      e.preventDefault();
      document.querySelector('.search-input')?.focus();
    }
  });
}
```

---

### Phase 3: Progressive Information Density

#### 3.1 — Table-to-Card Structural Morphing
**File**: `wts-admin/public/css/style.css`

Add responsive table transformation for mobile:

```css
@media (max-width: 768px) {
  .table-responsive-cards thead { display: none; }

  .table-responsive-cards tbody tr {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 16px;
    border-bottom: 1px solid var(--gray-200);
    background: var(--white);
    border-radius: var(--radius);
    margin-bottom: 8px;
    box-shadow: var(--shadow-sm);
  }

  .table-responsive-cards td {
    padding: 4px 0;
    border: none;
  }

  .table-responsive-cards td::before {
    content: attr(data-label);
    display: block;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--gray-500);
    margin-bottom: 4px;
  }

  .table-responsive-cards td:last-child {
    grid-column: 1 / -1;
  }
}
```

**EJS template changes**: Add `data-label` attributes to `<td>` elements and `table-responsive-cards` class to tables in all ~19 list templates.

#### 3.2 — State-Retentive Off-Canvas Navigation
**File**: `wts-admin/public/js/main.js`

Enhance sidebar with submenu state persistence:

```javascript
// In initSubmenuToggle(): save/restore expanded state via localStorage
const savedState = JSON.parse(localStorage.getItem('sidebarSubmenuState') || '{}');
```

#### 3.3 — Sticky Action Affordances
**File**: `wts-admin/public/css/style.css`

```css
@media (max-width: 768px) {
  .form-actions {
    position: sticky;
    bottom: 0;
    background: var(--white);
    padding: 16px;
    border-top: 1px solid var(--gray-200);
    box-shadow: 0 -2px 10px rgba(0,0,0,0.1);
    z-index: 50;
  }
}
```

#### 3.4 — Calendar Mobile View
**File**: `wts-admin/public/css/style.css`

Transform 7-column grid into agenda list on small screens:

```css
@media (max-width: 640px) {
  .cal-grid { grid-template-columns: 1fr; }
  .cal-header { display: none; }
  .cal-empty { display: none; }
  .cal-cell {
    min-height: unset;
    padding: 12px 16px;
    border-right: none;
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .cal-post-content, .cal-post-time, .cal-post-platforms { display: block; }
}
```

---

### Phase 4: Asset & Render Optimization

#### 4.1 — Layout Shift Prevention
**File**: `wts-admin/public/css/style.css`

Add `aspect-ratio` to image containers:

```css
.image-card-preview { aspect-ratio: 16 / 10; height: auto; }
.image-table-thumb { aspect-ratio: 1; }
.user-avatar, .user-avatar-small { aspect-ratio: 1; }
```

#### 4.2 — Intersection-Based Lazy Loading
**File**: `wts-admin/public/js/main.js` + EJS image templates

```javascript
function initLazyLoading() {
  document.querySelectorAll('.image-card-preview img, .image-grid img').forEach(img => {
    img.loading = 'lazy';
    img.decoding = 'async';
  });
}
```

Also add `loading="lazy"` directly in EJS `<img>` tags.

#### 4.3 — Responsive Image Delivery
Add `srcset` and `sizes` attributes where CDN supports transformation parameters.

---

### Phase 5: Mobile-Specific Layout Overhauls

#### 5.1 — Mobile Header Search
Replace hidden search at 480px with a search icon that opens full-width overlay.

#### 5.2 — Image Library Folder Sidebar
Extract inline `grid-template-columns: 240px 1fr` to `.image-library-layout` class with responsive override.

#### 5.3 — Notification Dropdown Mobile
Full-width notification panel anchored below header on small screens.

#### 5.4 — Modal Responsiveness
Full-viewport modals on mobile with proper `max-height`/`max-width`.

#### 5.5 — Automation Compiler Responsive
Stack tri-pane layout vertically on mobile, full-width toolbar inputs.

---

### Phase 6: Inline Style Extraction (EJS Cleanup)

| Template | Inline Style | New CSS Class |
|----------|-------------|---------------|
| `dashboard/index.ejs:141` | `grid-template-columns: repeat(auto-fit, minmax(340px, 1fr))` | `.dashboard-cards-grid` |
| `dashboard/index.ejs:215` | `grid-template-columns: repeat(2, 1fr)` | `.quick-actions-grid` |
| `images/library.ejs:30` | `grid-template-columns: 240px 1fr` | `.image-library-layout` |
| `social/calendar.ejs:50` | `display: flex; align-items: center; justify-content: space-between` | `.calendar-month-nav` |
| Various list templates | `style="width: 200px"` on search inputs | `.filter-input` class |
| Various list templates | `style="width: 150px"` on select dropdowns | `.filter-select` class |

---

## Implementation Order

1. CSS foundation — fluid variables and grid fixes (Phase 1.1 + 1.3)
2. Touch targets + focus states (Phase 2.1 + 2.2)
3. Inline style extraction (Phase 6) — move inline styles to CSS classes
4. Table morphing CSS + all ~19 list template `data-label` updates (Phase 3.1)
5. Mobile navigation enhancements — sidebar state + mobile search (Phase 3.2 + 5.1)
6. Sticky actions for forms/pages (Phase 3.3)
7. Calendar mobile agenda view (Phase 3.4)
8. CLS prevention + lazy loading (Phase 4.1 + 4.2)
9. Component mobile overrides — notifications, modals, compiler (Phase 5.3 + 5.4 + 5.5)
10. Container queries — progressive enhancement (Phase 1.2)
11. Keyboard shortcuts (Phase 2.3)
12. Responsive images — if CDN supports transforms (Phase 4.3)

# Sidebar & Top-Menu Backend Migration

This change moves floating-tab and top-navigation management into the
`wts-admin` backend so they are admin-controlled instead of hard-coded into
every static HTML page. It implements the plan in *"The Future of Sidebar
Management"* analysis report.

## What changed

### 1. Top navigation menus — net-new, backend-managed

- **Schema** (`wts-admin/database/db.js`): new `menu_items` table mirroring
  `sidebar_items`. A self-referencing `parent_id` enables dropdowns; `location`
  groups items into a named menu (`header`, `footer`). Indexed on
  `(location, is_visible)` and `(parent_id)`.
- **Admin CRUD** (`wts-admin/src/routes/webdev.js`): `/webdev/menus` list,
  new/create, edit/update, delete — mirroring the sidebar routes, behind the
  same `ensureAuthenticated` + `ensureAdmin` + rate limiter.
- **Admin views**: `webdev/menus/list.ejs` (grouped by location, shows the
  parent → child structure) and `webdev/menus/form.ejs` (with a parent picker
  that prevents two levels of nesting).
- **Admin nav**: a **Menu Manager** link added under *Connections* in
  `partials/sidebar.ejs`.
- **Public API** (`src/routes/public-api.js`): `GET /api/public/menu?location=header`
  returns a nested tree of visible items (each top-level item carries a
  `children` array).
- **Frontend loader** (`js/services/menu-loader.js`): renders the backend menu
  into any `[data-wts-menu="<location>"]` mount point. It is additive — if no
  menu is configured (or the API is unreachable) the mount's existing static
  markup is left in place as a fallback.

### 2. Sidebar consolidation — `action_type`

- `sidebar_items` gained `action_type` (`panel` | `link` | `modal`, default
  `panel`) and `target_form_type`. This lets a floating sidebar button open the
  slide-in panel (legacy), navigate to a link, or open the shared quote/contact
  modal — so the old hard-coded tabs can be reproduced as admin records.
- The admin sidebar form, the create/update routes, and the
  `/api/public/page-sidebar` response were all extended accordingly.
- `js/services/page-sidebar.js` now honours `action_type` (modal actions call
  `window.WTSQuote.open(target_form_type)`).

### 3. Hard-coded "quote / Affiliate Application" tab — retired

- The `<div id="quote-tab">` floating tab (and the already-hidden `<a>` variant
  on resources pages) was removed from **14 live HTML pages** (15 elements).
  The shared quote **modal** (`#quote-modal-overlay`) is intentionally kept — it
  is the render target the dynamic system opens.
- Dead `.quote-tab` CSS was removed from `css/components/floating-ui.css`, and
  the quote-tab wiring was removed from `js/modules/ui.js`.
- The replacement is the existing **admin-managed sticky form-button** system
  (`initStickyFormTabs` in `js/modules/firebase.js`, already wired on the main
  pages), which renders `.wts-sticky-tab` buttons from the Form Builder.

## Deploying

1. Deploy `wts-admin`. The new table/columns are created automatically on boot
   by the idempotent migrations in `database/db.js`.
2. **Seed the replacement sticky tabs** so the retired quote tab keeps showing:

   ```bash
   cd wts-admin
   node scripts/seed-sidebar-migration.js   # or: railway run node scripts/...
   ```

   This idempotently creates two sticky form buttons: *Leave a Message*
   (`general-inquiry`, site-wide) and *Affiliate Application* (`affiliate`, on
   `/en/company/affiliate-sales/`). Adjust or add more from
   **Message Board → Forms → Form Buttons** (placement = *Sticky side tab*).
3. **Populate menus** in **Connections → Menu Manager**. To render a managed
   menu on a page, add a mount point where the nav should appear, e.g.
   `<nav data-wts-menu="header"></nav>`, and include
   `<script src="/js/services/menu-loader.js"></script>`. Until a mount point is
   added, existing static headers are unaffected.

## Notes / follow-ups

- Wiring `data-wts-menu` mount points into the per-page static headers is left
  as a deliberate, page-by-page step that needs visual QA — it is the
  highest-risk part of the migration and is intentionally not done in bulk here.
- Inline, page-level `.quote-tab` `<style>`/`<script>` remnants on a few
  `resources/` pages are now inert (the element they referenced is gone and all
  references are null-guarded); they can be cleaned up opportunistically.

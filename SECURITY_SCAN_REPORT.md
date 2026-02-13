# Security Scan Report

**Repository:** marketing (WordsThatSells.Website)
**Date:** 2026-02-13
**Scope:** Full codebase security audit

---

## Executive Summary

This report covers a comprehensive security scan of the marketing repository, which includes a static frontend, a blog backend API (Node.js/Express), and an admin dashboard (Node.js/Express/EJS) backed by PostgreSQL.

| Severity | Count |
|----------|-------|
| CRITICAL | 3     |
| HIGH     | 4     |
| MEDIUM   | 8     |
| LOW      | 3     |

---

## CRITICAL Findings

### 1. Missing CSRF Protection

- **Location:** All forms across `wts-admin/src/views/`
- **Description:** No CSRF tokens are present in any form. No `csurf` or equivalent middleware is configured. All state-changing operations (POST, PUT, DELETE) are unprotected against Cross-Site Request Forgery attacks.
- **Impact:** An attacker could craft a malicious page that submits forms on behalf of an authenticated admin user, including creating/deleting content, modifying user accounts, or changing settings.
- **Recommendation:** Add a CSRF middleware (e.g., `csurf` or `csrf-csrf`) and include tokens in all forms.

### 2. Unauthenticated Database Setup Endpoint

- **Location:** `blog-backend/server.js` — `GET /api/setup-database`
- **Description:** This endpoint creates database tables and schema with no authentication check. Anyone who discovers this URL can trigger schema operations.
- **Impact:** Could overwrite or corrupt database tables in production.
- **Recommendation:** Remove this endpoint from production builds, or protect it with authentication and a one-time-use flag.

### 3. Hardcoded Fallback Session Secret

- **Location:** `wts-admin/server.js:98`
- **Code:** `secret: process.env.SESSION_SECRET || 'wts-admin-secret-key-change-in-production'`
- **Description:** If the `SESSION_SECRET` environment variable is not set, the application falls back to a weak, publicly visible default secret.
- **Impact:** Sessions can be forged or hijacked if the default secret is used in production.
- **Recommendation:** Remove the fallback and throw an error at startup if `SESSION_SECRET` is not configured.

---

## HIGH Findings

### 4. XSS — DOMPurify Installed but Never Used

- **Location:** `wts-admin/package.json` lists `dompurify`, but no file imports or calls it.
- **Description:** User-submitted HTML content (articles, glossary entries, etc.) is stored and rendered without sanitization.
- **Impact:** Stored XSS attacks via content fields that render in the admin dashboard or public-facing pages.
- **Recommendation:** Import and apply DOMPurify to all user-submitted HTML before database storage.

### 5. XSS — innerHTML Usage in Admin JS

- **Location:** `wts-admin/public/js/main.js:130, 155, 217+`
- **Description:** Search results and notifications are rendered using `innerHTML`. While an `escapeHtml` helper exists, the pattern is fragile and error-prone.
- **Impact:** If any data bypasses the escape function, DOM-based XSS is possible.
- **Recommendation:** Use `textContent` or a templating library instead of `innerHTML`.

### 6. IDOR — Missing Ownership Checks on Microsites

- **Location:** `wts-admin/src/routes/webdev.js:153, 195, 251, 285`
- **Description:** Microsite view, edit, update, and delete operations use `WHERE id = $1` without checking `author_id` against the current user. Any authenticated user can access or modify any other user's microsites.
- **Impact:** Unauthorized data access and modification.
- **Recommendation:** Add `AND author_id = $2` with `req.user.id` to all microsite queries.

### 7. Dependency Vulnerability — nodemailer (<= 7.0.10)

- **Advisories:**
  - [GHSA-mm7p-fcc7-pg87](https://github.com/advisories/GHSA-mm7p-fcc7-pg87) — Email to unintended domain via interpretation conflict (HIGH)
  - [GHSA-rcmh-qjqh-p98v](https://github.com/advisories/GHSA-rcmh-qjqh-p98v) — DoS via recursive addressparser calls (HIGH)
- **Fix:** `npm audit fix --force` to upgrade to nodemailer@8.0.1 (breaking change — review migration notes).

---

## MEDIUM Findings

### 8. Open CORS in Blog Backend

- **Location:** `blog-backend/server.js:20-23`
- **Code:** `origin: process.env.CORS_ORIGIN || '*'`
- **Description:** Defaults to wildcard CORS if `CORS_ORIGIN` is not set, combined with `credentials: true`.
- **Recommendation:** Remove the wildcard fallback and require explicit origins.

### 9. Weak Password Policy

- **Location:** `wts-admin/src/routes/auth.js:22, 238`
- **Description:** Only enforces minimum 8 characters. No complexity requirements (uppercase, digit, special character).
- **Recommendation:** Add complexity validation rules.

### 10. No Email Verification on Signup

- **Location:** `wts-admin/src/routes/auth.js:121`
- **Description:** Users are logged in immediately after signup without email verification.
- **Recommendation:** Implement email verification flow before granting access.

### 11. CSP Uses `unsafe-inline`

- **Location:** `wts-admin/server.js:39-41`
- **Description:** Both `scriptSrc` and `styleSrc` include `'unsafe-inline'`, which weakens Content Security Policy protections.
- **Recommendation:** Migrate to nonce-based or hash-based CSP for inline scripts/styles.

### 12. Missing Helmet on Blog Backend

- **Location:** `blog-backend/server.js`
- **Description:** Helmet is not installed or configured. The blog API sends no security headers (X-Frame-Options, X-Content-Type-Options, etc.).
- **Recommendation:** Install and configure Helmet.

### 13. Hardcoded Default Database Credentials

- **Location:** `wts-admin/database/db.js:26-32`
- **Description:** Fallback credentials (`postgres/postgres`) are hardcoded for when environment variables are missing.
- **Recommendation:** Remove the fallback and require explicit database configuration.

### 14. Unbounded Query Limits

- **Location:** `blog-backend/server.js:52`, `wts-admin/src/routes/api.js:111`
- **Description:** `parseInt(req.query.limit)` has no maximum cap. A request with `?limit=9999999` could exhaust database resources.
- **Recommendation:** Clamp limit to a reasonable maximum (e.g., 100).

### 15. Hardcoded Passwords in Local Dev Scripts

- **Location:** `deploy-local.sh:36,80,123`, `QUICK_START.md`, `BLOG_SETUP_GUIDE.md`
- **Description:** Development passwords like `blogpassword` and `mysecretpassword` are in committed files.
- **Recommendation:** Replace with placeholder instructions to set custom passwords.

---

## LOW Findings

### 16. Dependency — qs DoS (LOW)

- **Advisory:** [GHSA-w7fw-mjwx-w883](https://github.com/advisories/GHSA-w7fw-mjwx-w883) — arrayLimit bypass via comma parsing causes DoS.
- **Affected:** blog-backend, wts-admin, root
- **Fix:** `npm audit fix`

### 17. CSV Upload Validates Extension Only

- **Location:** `wts-admin/src/routes/content.js:35-45`
- **Description:** CSV file uploads validate file extension but not actual file content (magic bytes).
- **Recommendation:** Validate file content headers in addition to extension.

### 18. Version Endpoint Exposes Route Map

- **Location:** `blog-backend/server.js:431-453` — `GET /api/version`
- **Description:** Returns a list of all registered routes and database status.
- **Recommendation:** Restrict to authenticated users or remove in production.

---

## What's Done Well

- **SQL Injection Prevention:** All database queries use parameterized statements (`$1`, `$2`) — no string concatenation found.
- **Password Hashing:** bcryptjs with 12 salt rounds is used correctly.
- **Rate Limiting:** Applied across API, auth, content, and public endpoints.
- **Environment Variables:** All production secrets (Stripe, OAuth, SMTP, database) are referenced via `process.env` — no real keys committed.
- **`.gitignore` Configuration:** `.env` files are properly excluded; no actual `.env` files found in the repository.
- **File Upload Path Traversal Protection:** `assertPathWithin()` helper prevents directory traversal attacks on image uploads.
- **OAuth Implementation:** Google and Facebook OAuth use standard Passport.js strategies with proper configuration.

---

## Recommended Priority Actions

1. **Immediate:** Add CSRF protection, remove/protect `/api/setup-database`, remove session secret fallback
2. **This week:** Implement DOMPurify sanitization, fix IDOR in webdev routes, upgrade nodemailer, restrict blog CORS
3. **Soon:** Strengthen password policy, add email verification, add Helmet to blog backend, cap query limits
4. **Maintenance:** Fix CSP unsafe-inline, validate CSV content, restrict version endpoint

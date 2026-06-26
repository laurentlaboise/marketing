# Task: Configure GITHUB_TOKEN so image uploads publish to the CDN

> **The GITHUB_TOKEN fix is operational, not in this PR — you still need a valid
> token with `contents: write` set in Railway for uploads to publish to the CDN.**

This is an **operational** task (a runtime secret in Railway), not a code change.
The code that uses the token is already merged. An agent or a human with access
to the GitHub account and the Railway project must complete the steps below.

## Background

The admin app (`wts-admin`) optimizes uploaded images to WebP and then pushes
them to the `laurentlaboise/marketing` repo via the GitHub API, so jsDelivr can
serve them from the CDN:

```
https://cdn.jsdelivr.net/gh/laurentlaboise/marketing@main/images/<file>
```

If `GITHUB_TOKEN` is missing, invalid, expired, or lacks write permission, the
upload still succeeds locally but the push fails (e.g. `github_401`) and the
image never reaches the CDN. On Railway's ephemeral filesystem the local copy is
also lost on the next redeploy.

## Prerequisites

- Access to the GitHub account that owns `laurentlaboise/marketing`.
- Access to the Railway project running the `wts-admin` service.

## Steps

1. **Revoke any exposed token.** If a token was ever pasted into chat, a commit,
   logs, or any shared channel, treat it as compromised: GitHub → Settings →
   Developer settings → Personal access tokens → revoke it.

2. **Create a new token** scoped to exactly what is needed:
   - **Fine-grained token (preferred):**
     - Resource owner: `laurentlaboise`
     - Repository access: **Only select repositories → `laurentlaboise/marketing`**
     - Repository permissions: **Contents → Read and write**
     - Set a reasonable expiry and a calendar reminder to rotate before it lapses.
   - **or Classic token:** scope **`repo`**.

3. **Set it in Railway:**
   - Open the Railway project → the **`wts-admin`** service → **Variables** tab.
   - Add or update the variable:
     - Key: `GITHUB_TOKEN`
     - Value: *(the new token — never commit it or paste it in chat)*
   - Save. Railway redeploys automatically; if not, click **Redeploy**.

4. **Verify (no test upload needed):**
   - Hit the health endpoint: `GET https://<admin-domain>/images/github-status`
     - Expect `{ "ok": true, "reason": "ok", ... }`.
   - Or open the **Upload Image** page in the admin:
     - No warning banner = connected and ready.
     - A warning banner names the exact problem (invalid / expired / no write).

5. **Confirm end-to-end:** upload a small test image. The success message should
   say it was pushed to the CDN. Open the `cdn_url` shown on the image detail
   page and confirm it loads (jsDelivr may take a moment on first fetch).

## Notes

- The token is a **runtime secret**. It belongs in Railway environment variables
  only — never in the repository, code, commit messages, or chat.
- Tokens expire. If uploads start failing with `github_401` again later, the
  most likely cause is an expired token; repeat steps 2–4.
- Related code already in place: token verification (`verifyGitHubToken`), the
  `/images/github-status` endpoint, retry-with-backoff on push, jsDelivr cache
  purge, and actionable error messages — all in `wts-admin/src/routes/images.js`.

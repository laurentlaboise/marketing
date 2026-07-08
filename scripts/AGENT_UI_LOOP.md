# Multi-agent UI improvement loop (WordsThatSells)

Use this playbook when improving the static marketing site with multiple agents.

## Roles
| Agent | Role |
|-------|------|
| **Explore** (read-only) | Find HTML/CSS/JS bugs, list P0–P2 with paths |
| **Grok / Claude** | Prioritize + implement code fixes |
| **ChatGPT** | UI/visual direction (colors, spacing, CTAs) when available |
| **Perplexity / web** | Competitive or a11y reference checks |
| **Verifier** (`/check-work`) | Confirm fixes; FAIL → loop again |

## Loop (repeat until verifier PASS or 3 rounds)
1. **Discover** — explore agent audit of `en/` + `css/` + `js/`
2. **Prioritize** — pick top 8–12 P0/P1 only
3. **Implement** — one branch, focused commits
4. **Re-scan** — grep for regressions (footer, wa.me, href="#", section balance)
5. **Verify** — check-work or manual curl + structure python scan
6. **Ship** — PR + merge

## Machine API (admin)
```bash
export ADMIN_API_TOKEN='…'
cd wts-admin && ./scripts/machine-api.sh health
./scripts/machine-api.sh seed-pricing
```

## Regression checklist
- [ ] No `footer-bottom"<`
- [ ] No `wa.me/020` (use `8562055528034`)
- [ ] Hero CTAs not `href="#"`
- [ ] `.modal-overlay.active { display:flex }`
- [ ] section open/close balanced on company pages
- [ ] Pricing public shows Footprint / Growth / Automation

# WTS Admin — orientation (help reference)

The admin back-office at admin.wordsthatsells.website manages the WordsThatSells marketing site, customer portal, localization platform, and workforce.

## Main areas (sidebar)
- /dashboard — overview, profile, settings. Reachable by any signed-in staff account.
- /content — articles, AI tools directory, site content (admins only).
- /business — products, packages, orders and payment confirmation (admins only). BCEL OnePay transfers are confirmed here: match the customer's WTS- reference against the bank statement, then confirm the order.
- /translations — the localization platform (see area reference when on those pages). Admins run the pipeline; translator vendors get a scoped workspace.
- /webdev — website tools including the Footer Manager and Menu Manager (admins only).
- /partners — approval queue for portal partner-program applications (affiliate, dropship, white label). Applications arrive as "pending"; approving sets "active", rejecting lets the customer re-apply, suspending pauses an active partner.
- /workforce — leads CRM and team management (admins; vendors see their own hub).
- /images — image library (admins only).

## Roles
- superadmin / admin — full access (the two are equivalent).
- translator — vendor role scoped to /translations workspace and earnings for their assigned languages only.
- user — signed-in account with no admin surfaces (restricted dashboard only).

## Customer portal (what customers see)
Customers use a separate portal (my.wordsthatsells.website or /portal): passwordless login, orders/billing history, shared files, partner-program applications, profile, and an AI assistant chat. Customer requests submitted there land in the admin form-submissions inbox tagged portal_request.

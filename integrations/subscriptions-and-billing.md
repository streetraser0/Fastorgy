# Subscription and billing status

The Site has a Worker and D1 for visits and demo-sales statistics, but no real paid entitlement, checkout, recurring billing, subscription authorization, or notification delivery outside this browser. No payment was attempted or accepted. See `../docs/site-handbook.md` for the current operating scope.

## Agreed prices
- Free: 0 RUB, basic catalog and conditions.
- Standard: 500 RUB per month. Optional first annual purchase: 4800 RUB (20% below 12 monthly payments, 6000 RUB). Renewal: 6000 RUB/year.
- Premium: regular 10000 RUB/year. First-year offer: 8000 RUB (20% discount). Renewal: 10000 RUB/year.
- No fabricated promotion deadline. No automatic renewal is enabled. Any future recurring billing requires explicit consent and cancellation controls.

Monthly/yearly pricing and demo feature previews exist. Selecting a plan does not grant real paid access or charge the visitor. Preview mode is temporary browser state and is visibly labelled. All real server authorization must be implemented separately; client-side visibility is not access control.

Selected banking provider: T-Bank (user choice, connection postponed). The acquiring/recurring product and contract for subscriptions have not been confirmed. Ordinary card acquiring must not be represented as auction escrow. Official starting point: https://developer.tbank.ru/eacq/ . The previously suggested YooKassa option was not connected and is not the selected bank.

Before enabling payments: merchant account, approved payment and receipt settings, server runtime, secrets, authenticated users, server-side fixed plan/period prices, idempotent checkout, server verification of payment events, receipt handling, expiry/renewal records, refund/cancellation logic, and explicit first-year/renewal terms. A success URL by itself must never activate access. Do not collect card details in this Site.

## New-lot notifications
Subscriptions are saved locally with category, region, optional maximum price, active state, and known lot IDs. New matching published lots yield in-site notices without duplicates; drafts do not. Paused subscriptions do not notify. This works only for data available in this browser, not across banks/users.

For production: persist subscription/user ownership on a server, process publication events, store delivery attempts with deduplication, support unsubscribe, and configure each notification channel with its own consent. SMS, push, email and background delivery are not connected.

## Distance
User GPS is requested only by an explicit button and is kept in memory for the session. Without GPS, use the chosen region's approximate administrative center. Exact lot coordinates can be entered by managers or imported through CSV. Otherwise known city/region reference points are approximate. Distances use the Haversine formula, measure a straight line, and do not claim road distance. Unknown locations sort last. With nearest sorting selected, distance takes precedence over category grouping across the feed and catalog. Existing category filtering remains available.

# External valuation integration

Selected vehicle provider: AUTOSTAT valuation calculator API.
Official service: https://www.autostat.ru/research/product/381/

Status: selected but NOT connected. Requires commercial access, API documentation, server-side secret setup, vehicle data mapping, and a verified test request. Public product description confirms an API but does not document endpoints or authentication; these must not be invented.

The existing autoru.mjs adapter is an unused alternative only. It is NOT the selected provider and is not deployed or invoked.

Alternative provider documentation:
Documentation: https://yandex.ru/dev/autoru/doc/ru/reference/evaluation-process

Status: server-only adapter prepared and mock-tested; not connected to the website. The existing Worker currently serves visits and demo-sales statistics, not valuation. No real provider requests have been made. A configured partner account and a reviewed authenticated server integration are required.

Deployment checklist:
- Obtain partner authorization with access to valuation and permission to display returned valuations.
- Store AUTORU_API_TOKEN as a server runtime secret, never in HTML, browser storage, a commit, or chat.
- Extend the existing server with a reviewed authenticated manager endpoint that calls the selected provider adapter. Do not expose provider calls or credentials in the browser. See `../docs/architecture.md` for the current Worker/D1 boundary.
- Use validated VIN/registration, mileage, and Yandex region ID from each lot; do not send invented identifiers.
- Add server-side role checks, per-lot cache, rate limits and persisted dated assessment records before enabling the endpoint.
- Return only normalized valuation data to viewers. No credentials or raw vehicle history should be exposed.
- The response is a range. Its midpoint is a reference, not a claimed mean market transaction price. Do not label a provider algorithm as AI unless the provider confirms that claim.
- Do not reuse the vehicle adapter for homes or other assets; choose an appropriate licensed provider.

Until connected, the published Site explicitly says the external service is not connected. Optional manually provided comparables are shown separately as seller data.

## Server integration contracts

[Integration contracts](contracts/README.md) contain executable boundary checks, types and transport schemas for future bank, assistant, authentication, listing-identity and recovery integrations. They are disabled by default and do not connect providers, implement shared auctions or certify production readiness. Run `node tests/integration-contracts.cjs` from the repository root.

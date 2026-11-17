# Phone authentication status

Provider selected: SMS.RU. https://sms.ru/docs/api/api_group_sms/send
Current status: NOT connected. The Site has a Worker and D1 for visits and demo-sales statistics, but no OTP server or real user account/session for auctions. The interface never accepts a demonstration code, never locally marks a phone verified, and does not claim an SMS was sent unless an API request succeeds. See `../docs/architecture.md` for the current server boundary.

Prepared: accessible phone/code forms, normalization of Russian phone numbers, one-time-code autocomplete, region preference, and server-only SMS sending adapter.

Required to enable real registration:
- A funded SMS.RU account and approved sender as required by the provider.
- Server runtime and protected SMSRU_API_ID configuration.
- Persisted users, regions, one-time challenges and sessions; atomic OTP consumption.
- Cryptographically generated six-digit codes, short expiry, hashed storage, bounded verification attempts, per-phone and per-IP rate limiting, resend cooldown and abuse protection.
- POST /api/auth/request: validated phone and region -> challengeId only after provider accepts message. Never return OTP.
- POST /api/auth/verify: validate challenge/code -> authenticated=true only after atomic verification; issue Secure, HttpOnly, SameSite session cookie. Check request origin.
- Server-enforced buyer/bank/manager roles; never trust the demo role selector or client-side user properties.
- Save home region on the authenticated user record. Guest preferences currently stay only in localStorage.
- Review consent text and privacy policy before real deployment.

Do not put provider credentials or verification codes in chat, Git, browser storage, HTML, logs or API error messages. No real SMS was sent during development.

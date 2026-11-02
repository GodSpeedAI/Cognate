# @godspeed/identity

One definition of the operator for Horizon and Workbench. Portable TypeScript on `node:crypto`, no third-party dependencies.

- Pairing: single-use link, 5 minute lifetime, 32-byte secret kept only as a SHA-256 verifier, one synchronous consume. The link authorises passkey enrolment for an already-approved flow; it creates no operator and grants no role.
- WebAuthn: RP ID and origin are required configuration. User presence and verification are required, the sign counter must rise, challenges are single use with a 2 minute TTL.
- Operators, sessions, devices: records in any `DurableStore` (`commit` with record writes and expected versions). Sessions store a token hash only and resolve to the durable operator; `Caller` comes from that record. Bumping an operator's generation revokes every session and device.
- Execution posture: `contained` (default) or `uncontained-local`; anything else throws.

Not included: the HTTP/mobile surface, QR and cookie handling, and the registry wrapper that enforces posture (it depends on the execution package and stays in the application).

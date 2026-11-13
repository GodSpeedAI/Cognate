# identity — agent guide
Owns the shared operator identity contract. The session `Caller` is built only from the durable operator record, never from client input. Stores are injected as `DurableStore`; nothing here picks a store, an RP ID, an origin, or an OS account. A pairing link authorises passkey enrolment only; it never creates an operator or grants a role.

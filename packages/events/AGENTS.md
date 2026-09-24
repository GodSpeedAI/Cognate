# events — agent guide
Owns the store port and its kit. Any change to `DurableStore` semantics must update the kit and both stores in one change. Never let a store report success before its transaction commits (§31.2).

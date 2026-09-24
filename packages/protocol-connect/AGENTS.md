# protocol-connect — agent guide
Owns wire mapping only; semantics live in runtime-api. Changing a proto field means: edit `proto/`, regenerate `packages/proto` (`bun run generate`), update the mapping here, and keep the service kit green over Connect.

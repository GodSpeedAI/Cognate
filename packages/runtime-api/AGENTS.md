# runtime-api — agent guide
Owns the service and agent contracts. Depends only on kernel-api and events. Changing a request/response shape is a contract revision: update runtime-bun, protocol-connect (proto + mapping), client, and the kit together.

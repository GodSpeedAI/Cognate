# agent-discovery package guidance

This package observes executable locations and config files without executing them. Keep presence, configuration, authentication, active plugin state, and demonstrated capability distinct. Never read credential contents into reports. Add agent definitions as data with tests under fake HOME/PATH. Dynamic hooks must be reported unresolved, not absent.

Runtime: Bun >= 1.4.0. License: Apache-2.0. Test: `bun test packages/agent-discovery/test`.

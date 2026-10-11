# provider-anthropic-compatible package guidance

Use native Anthropic Messages wire shape, x-api-key authentication (or explicit alternative credential source), tool_use/input_schema/tool_result, and message_stop for stream settlement. Never advertise unsupported structured output. Keep upstream text and secrets out of error messages.

Runtime: Bun >= 1.4.0. License: Apache-2.0. Test: `bun test packages/provider-anthropic-compatible/test`.

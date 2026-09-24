# AG-UI Phase 0 notes

Environment: Bun 1.4.0, `@ag-ui/core@1.0.0`, `@ag-ui/encoder@1.0.0`, `@ag-ui/proto@1.0.0`, `zod@3.25.76` (peer, installed transitively via `@ag-ui/encoder`).

Commands run from `compatibility/phase0/ag-ui/`:

```
bun install      # exit 0, 6 packages installed
bun test ag-ui.test.ts   # exit 0, 20 pass / 0 fail, 46 expect() calls
```

## Import paths (load-bearing — the obvious import fails)

`@ag-ui/core`'s `package.json` `exports` map splits runtime values from Zod schemas:

```json
{
  ".": { "import": "./dist/index.mjs", "require": "./dist/index.js" },
  "./schemas": { "import": "./dist/schemas.mjs", "require": "./dist/schemas.js" }
}
```

- `EventType` (the enum) and every TypeScript type come from `@ag-ui/core`.
- Every `*Schema` Zod validator (`EventSchema`, `RunAgentInputSchema`,
  `RunStartedEventSchema`, ...) comes from `@ag-ui/core/schemas`, **not**
  the root import. Importing `EventSchema` from `@ag-ui/core` throws
  `SyntaxError: Export named 'EventSchema' not found` under Bun — this is
  not a Bun bug, it's the package's real export surface.

## EventType — all 31 values (as of 1.0.0)

The task brief lists 14 event kinds; `@ag-ui/core@1.0.0` actually ships 31.
Full list (`Object.values(EventType)`):

```
TEXT_MESSAGE_START, TEXT_MESSAGE_CONTENT, TEXT_MESSAGE_END, TEXT_MESSAGE_CHUNK,
TOOL_CALL_START, TOOL_CALL_ARGS, TOOL_CALL_END, TOOL_CALL_CHUNK, TOOL_CALL_RESULT,
STATE_SNAPSHOT, STATE_DELTA,
MESSAGES_SNAPSHOT,
ACTIVITY_SNAPSHOT, ACTIVITY_DELTA,
RAW, CUSTOM,
RUN_STARTED, RUN_FINISHED, RUN_ERROR,
STEP_STARTED, STEP_FINISHED,
REASONING_START, REASONING_MESSAGE_START, REASONING_MESSAGE_CONTENT,
REASONING_MESSAGE_END, REASONING_MESSAGE_CHUNK, REASONING_END,
REASONING_ENCRYPTED_VALUE,
SUBAGENT_STARTED, SUBAGENT_FINISHED, SUBAGENT_ERROR
```

`_CHUNK` variants (`TEXT_MESSAGE_CHUNK`, `TOOL_CALL_CHUNK`) are shorthand
forms for producers that can't pre-announce a start; `REASONING_*` and
`SUBAGENT_*`, plus `ACTIVITY_*` and `STEP_*`, did not exist in the 0.0.x
line this task's list was evidently written against.

## Event field schemas (the event-by-event matrix source)

Every event carries a common base: `type` (literal discriminator),
`timestamp?: number`, `rawEvent?: any`, `metadata?: Record<string, any>`
(all schemas are "loose" — unknown extra keys pass through).

| Event | Required fields (beyond base) | Optional |
| --- | --- | --- |
| `RUN_STARTED` | `threadId: string`, `runId: string` | `protocolVersion`, `parentRunId`, `input: RunAgentInput` |
| `RUN_FINISHED` | `threadId`, `runId` | `result: any`, `outcome: {type:"success", pendingToolCallIds?} \| {type:"interrupt", interrupts:[]} \| {type:"cancelled"}`, `usage: TokenUsage[]` |
| `RUN_ERROR` | `message: string` | `code`, `usage: TokenUsage[]` |
| `TEXT_MESSAGE_START` | `messageId: string` | `role`, `name`, `subagentRunId` |
| `TEXT_MESSAGE_CONTENT` | `messageId`, `delta: string` | `subagentRunId` |
| `TEXT_MESSAGE_END` | `messageId` | `subagentRunId` |
| `TEXT_MESSAGE_CHUNK` | (none — every field optional) | `messageId`, `role`, `delta`, `name` |
| `TOOL_CALL_START` | `toolCallId: string`, `toolCallName: string` | `parentMessageId`, `subagentRunId` |
| `TOOL_CALL_ARGS` | `toolCallId`, `delta: string` | — |
| `TOOL_CALL_END` | `toolCallId` | — |
| `TOOL_CALL_CHUNK` | (none) | `toolCallId`, `toolCallName`, `parentMessageId`, `delta` |
| `TOOL_CALL_RESULT` | `messageId`, `toolCallId`, `content: string \| ContentPart[]` | `role: "tool"` |
| `STATE_SNAPSHOT` | `snapshot: any` | — |
| `STATE_DELTA` | `delta: JsonPatchOperation[]` (RFC 6902: `add`/`remove`/`replace`/`move`/`copy`/`test`, each with `path` and, where applicable, `value`/`from`) | — |
| `MESSAGES_SNAPSHOT` | `messages: Message[]` (discriminated by `role`: developer/system/assistant/user/tool) | — |
| `CUSTOM` | `name: string`, `value: any` | — |
| `ACTIVITY_SNAPSHOT` / `ACTIVITY_DELTA` | activity-log analogue of state snapshot/delta | — |
| `STEP_STARTED` / `STEP_FINISHED` | step name bookkeeping for producers with an explicit step concept | — |
| `REASONING_*` | mirrors `TEXT_MESSAGE_*` but for a reasoning/thinking channel; `REASONING_ENCRYPTED_VALUE` carries an opaque encrypted payload | — |
| `SUBAGENT_*` | `subagentRunId` scoped lifecycle events for nested agent runs | — |

`EventSchema` is a Zod discriminated union over all 31 event schemas keyed
on `type`; an unrecognized `type` value is rejected, not silently accepted.

## RunAgentInput shape

```ts
{
  threadId: string;
  runId: string;
  protocolVersion?: string;
  parentRunId?: string;
  state?: unknown;           // nullable, passed through
  messages: Message[];       // required, discriminated union by role
  tools?: Tool[];
  context?: Context[];
  forwardedProps?: Record<string, unknown>;
}
```

## Malformed-event behavior (observed)

- Missing a required field (`RUN_STARTED` without `runId`, `TEXT_MESSAGE_CONTENT`
  without `delta`, `TOOL_CALL_START` without `toolCallName`, `CUSTOM` without
  `name`) throws a `ZodError` from both the specific `*Schema` and the
  general `EventSchema`.
- An unknown JSON Patch `op` value in `STATE_DELTA.delta` is rejected (the
  patch operation schema is itself a closed discriminated union).
- An unrecognized `type` discriminator on `EventSchema` is rejected —
  the union does not fall through to an open/passthrough case.

## Encoder / proto packages

Both `@ag-ui/encoder@1.0.0` and `@ag-ui/proto@1.0.0` exist on npm at the
pinned version and installed cleanly alongside `@ag-ui/core`.

- `@ag-ui/encoder` exports `EventEncoder` with `.encode()`, `.encodeSSE()`,
  `.encodeBinary()`, `.encodeProtobuf()`, and `.getContentType()`.
  `encodeSSE(event)` produces a standard `data: <json>\n\n` frame under Bun
  — confirmed by round-tripping through `JSON.parse`.
- `@ag-ui/proto` exports free functions `encode(event): Uint8Array` and
  `decode(bytes): BaseEvent`, plus `AGUI_MEDIA_TYPE` and
  `AGUIUnknownEventTypeError` (for a valid-but-unrecognized protobuf
  variant, distinguished from a genuine decode failure). Encode/decode
  round-trips correctly under Bun with no additional native bindings.

## Open questions

- The reference profile in the spec's §38 lists `@ag-ui/proto or encoder as
  required` (either/or); this fixture exercises both since both installed
  and worked without conflict, but the eventual adapter should pick one
  wire format and document why (protobuf for binary transports, JSON/SSE
  for the common HTTP streaming case).
- `TOOL_CALL_RESULT.content` supports multimodal parts (`text`/`image`/
  `audio`/`video`/`document`) beyond plain string content; not exercised
  by this fixture's assertions but validated implicitly since the schema
  accepts the plain-string form used here.

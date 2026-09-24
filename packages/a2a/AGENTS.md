# a2a — agent guide
Adapter only: no authority decisions here. Every call runs through `RuntimeService` as the
connection's authenticated caller. Task id is the run id; never invent A2A shapes — verify against
`node_modules/@a2a-js/sdk`'s types and codecs.

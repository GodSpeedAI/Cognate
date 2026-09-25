# my-cognate-app (copilot)

```bash
bun install
bun dev
```

`bun dev` runs `cognate dev`: parses `domain/*.sea`, starts a copilot app
(model, tool loop, continuations) backed by `.cognate/app.sqlite`, and serves
the Astryx chat UI at `/`, AG-UI at `/agui`, the Connect `RuntimeService` at
`/cognate.v1.RuntimeService/*`, and `/health`.

Edit `domain/*.sea` for your domain model, add backend tools in
`src/capabilities`, and add agents in `src/agents`.

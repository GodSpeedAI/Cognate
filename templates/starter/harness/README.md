# my-cognate-app (harness)

```bash
bun install
bun dev
```

`bun dev` runs `cognate dev`: parses `domain/*.sea`, starts a harness loop
agent backed by `.cognate/app.sqlite`, and serves `/health` and the Connect
`RuntimeService` at `/cognate.v1.RuntimeService/*`. There is no browser UI for
this profile.

Edit `domain/*.sea` for your domain model, add tools in `src/capabilities`,
and add agents in `src/agents`.

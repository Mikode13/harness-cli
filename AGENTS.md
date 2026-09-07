# AGENTS.md

## Repository purpose

`@mikode13/harness-cli` is the interactive command-line consumer of
`@mikode13/harness`. It turns the harness agent contract into a terminal conversation that
can be used like a provider CLI while keeping terminal I/O out of the harness package.

The project is source-available and private as an npm package. It is a runnable application,
not another implementation of the harness library.

## Boundaries

- `src/cli.ts` is the composition root. It chooses provider SDKs, models, retry policy, and
  the orchestrated planner → executor → reviewer workflow.
- `src/conversationLoop.ts` owns the turn-by-turn terminal lifecycle, cancellation, and
  usage reporting.
- `src/adapters/` contains terminal adapters for logging and readline input.
- `src/progressEventFormatter.ts` translates harness progress events into terminal output.
- Provider behavior, error classification, and agent contracts belong in
  `@mikode13/harness`; do not copy them into this repository.

## Operational constraints

- The mandatory test suite must remain offline and must not contact provider SDKs.
- `HARNESS_AUTO_APPROVE=true` enables provider permission bypasses and is safe only in a
  trusted workspace. The default is disabled.
- Preserve the `Agent` boundary: this project consumes the harness contract and owns only
  composition and terminal presentation.
- Keep provider SDK calls and provider-specific configuration at the composition root.

## Local validation

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm test
pnpm run build
```

Run the interactive CLI with `pnpm start` after building. The CLI requires valid credentials
for the configured Codex and Claude providers.

# AGENTS.md

## Repository purpose

`@mikode13/harness-cli` is the terminal consumer of `@mikode13/harness`. It turns the harness
agent contract into an interactive session, and into a single-turn run that a script or a CI
job can call, while keeping terminal I/O out of the harness package.

The project is source-available and private as an npm package. It is a runnable application,
not another implementation of the harness library.

## Boundaries

- `src/cli.ts` is the entry point. It sets the process exit code from `src/dispatch.ts`.
- `src/dispatch.ts` owns the command-line contract: it selects the interactive session or a
  command, prints the usage for a rejected command line, and maps each outcome to an exit code.
  Options without a command configure the interactive session.
- `src/agentOptions.ts` parses the agent options both modes share. Each mode applies its own
  rules on top: whether `--agent` is required and what a positional means.
- `src/repl.ts` and `src/conversationLoop.ts` own the interactive session: the agent it runs,
  the spinner in `src/spinner.ts`, Ctrl+C handling, the turn-by-turn terminal lifecycle,
  cancellation, and usage reporting.
- `src/singleTurn.ts` owns the `single-turn` command: its prompt, signal cancellation, and the
  stdout contract.
- `src/errors.ts` holds `CliUsageError`, which marks a rejected command line.
- `src/promptEmitter.ts` and `src/output.ts` are the terminal ports; `src/adapters/` contains
  their readline and console adapters.
- `src/progressEventFormatter.ts` translates harness progress events into terminal output.
- Provider behavior, error classification, and agent contracts belong in
  `@mikode13/harness`; do not copy them into this repository.

## Operational constraints

- The mandatory test suite must remain offline and must not contact provider SDKs.
- `--auto-approve` enables provider permission bypasses and is safe only when both the
  workspace and the prompt are trusted, never with content an outside contributor controls. The
  default is disabled.
- A single-turn run writes only its JSON result to stdout. Progress, warnings, and failures
  belong on stderr, and the JSON fields are listed explicitly rather than serialized from
  `AgentResponse`, so the published contract cannot drift with the harness type.
- A single-turn run requires `--agent`. Do not add a default agent: the caller decides which
  provider the run spends.
- The interactive session runs the orchestrator unless `--agent` is given, and rejects
  `--model` and `--reasoning-effort` without `--agent` instead of ignoring them. It must parse
  its options before opening readline, so a rejected command line exits instead of hanging.
- Preserve the `Agent` boundary: this project consumes the harness contract and owns only
  composition and terminal presentation.
- Build agents only through the harness factories, `createAgent` and `createOrchestrator`. Do
  not import provider SDKs into this repository.

## Local validation

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm test
pnpm run build
```

Run the interactive CLI with `pnpm start` after building. The CLI requires valid credentials
for the configured Codex and Claude providers.

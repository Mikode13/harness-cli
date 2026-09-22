# @mikode13/harness-cli architecture

This document describes the current architecture of `@mikode13/harness-cli`. Historical
reasoning belongs in [`decisions.md`](decisions.md); cross-project policy belongs in
[`Mikode13/engineering`](https://github.com/Mikode13/engineering). Future designs are named
explicitly.

## Purpose and scope

The project is the terminal consumer of `@mikode13/harness`. It owns command-line parsing,
interactive terminal behavior, single-turn automation, process lifecycle, terminal rendering,
and the published command, stdout, stderr, and exit-code contracts. Provider integrations,
failure classification, retries, and agent orchestration remain in the harness package.

This document covers the application under `src/`, its boundary with the harness, and the
published `harness-cli` command. Tests and release automation support that architecture but are
not runtime components.

## Architectural shape

The application is deliberately shallow. Most source files own one terminal concern and live
directly under `src/`; only concrete terminal adapters are grouped under `src/adapters/`.
There is no second domain model alongside the harness. Local interfaces isolate readline and
console output where tests need substitutes, while the harness `Agent` contract remains the
boundary for all agent behavior.

- `src/cli.ts` is the executable entry point and applies the exit code returned by dispatch.
- `src/dispatch.ts` owns the top-level command selection and process outcome mapping.
- `src/agentOptions.ts` parses the agent options shared by both execution modes.
- `src/repl.ts` composes the interactive terminal session.
- `src/conversationLoop.ts` drives prompts and repeated agent turns.
- `src/singleTurn.ts` owns the non-interactive automation path.
- `src/promptInput.ts` reads a single-turn prompt from an argument, file, or stdin.
- `src/progressEventFormatter.ts` maps provider-independent progress events to terminal text.
- `src/promptEmitter.ts` and `src/output.ts` define the local terminal ports;
  `src/adapters/` binds them to readline and the console.
- `src/spinner.ts` owns interactive progress animation, and `src/errors.ts` marks rejected
  command lines.

## Responsibilities and boundaries

`dispatch` is the application boundary. It distinguishes the interactive session from the
`single-turn` command, maps usage and provider configuration errors to exit code `2`, maps
cancelled or failed work to `1`, and returns `0` only after the selected mode completes.

The interactive path owns a long-lived terminal session. `Repl` builds either one agent or the
harness orchestrator before readline takes control of stdin, connects harness progress to the
spinner and output formatter, and delegates repeated turns to `ConversationLoop`.
`ConversationLoop` owns one abort controller at a time and closes its terminal ports when the
session ends.

The single-turn path owns automation. It requires an explicit provider, accepts exactly one
prompt source, builds one harness agent, forwards progress to stderr, and writes one JSON result
to stdout. It never starts readline or the harness orchestrator.

The harness boundary is intentionally one-way: this project imports the public agent factories,
types, errors, and guards from `@mikode13/harness`. It does not import provider SDKs or recreate
provider behavior, retry rules, failure classification, or orchestration.

## Dependencies and contracts

`@mikode13/harness` is the only runtime package dependency. Node.js supplies process signals,
argument parsing, filesystem and stdin access, and readline. Source modules depend on the harness
and the small local terminal ports; concrete adapters depend on those ports. Nothing in the
harness depends on this application.

The published interface is the `harness-cli` executable rather than an importable JavaScript
API. Its compatibility surface consists of:

- command names and options;
- the four explicit single-turn JSON fields on stdout;
- the rule that progress, warnings, and failures use stderr;
- exit codes `0`, `1`, and `2`; and
- cancellation through `SIGINT` and `SIGTERM`.

The package ships compiled JavaScript under `dist/` only. It deliberately publishes neither
declarations nor source maps because consumers execute the command instead of importing modules.

## Important flows

**Interactive session.** `cli.ts` passes process arguments to `dispatch`. With no command,
`dispatch` constructs `Repl`, which validates options and creates either an agent or the
orchestrator before opening readline. `ConversationLoop` reads a prompt, starts a turn, passes
the prompt, abort signal, and progress callback to `Agent.run`, reports usage, and returns to
the prompt. Ctrl+C aborts an active turn; while idle, a second Ctrl+C within three seconds closes
the session.

**Single-turn run.** `dispatch` selects `singleTurn.start`, which validates the provider and
prompt source, installs signal handlers, and reads the prompt when it comes from a file or stdin.
It creates one agent and calls `Agent.run`. Progress is formatted to stderr as it arrives. A
successful response is reduced to the four published fields and written as one JSON line to
stdout; cancellation or failure returns through `dispatch` without contaminating stdout.

## Constraints and trade-offs

- The mandatory tests remain offline. Integration tests run the real harness and replace only
  provider SDKs, plus readline where the interactive terminal needs a deterministic substitute.
- `--auto-approve` crosses a security boundary. It remains explicit and is safe only when both
  the workspace and the entire prompt are trusted.
- The single-turn stdout schema is intentionally narrower than `AgentResponse`. A new harness
  field does not become a CLI contract accidentally, at the cost of deliberate work to expose
  one.
- The interactive and single-turn paths share parsing and formatting but not composition. This
  duplicates a small amount of lifecycle code so automation never inherits readline or spinner
  behavior.
- Provider capabilities and configuration are limited by the released harness dependency. This
  project cannot add or repair them locally without breaking the ownership boundary.

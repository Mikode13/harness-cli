# @mikode13/harness-cli

An interactive command-line consumer for [`@mikode13/harness`](https://github.com/Mikode13/harness).
It provides a terminal experience for the harness's plan → execute → review workflow while
keeping provider orchestration in the harness library and terminal concerns in this project.

## Status

This is an early executable baseline. It currently runs one fixed composition: Codex plans
and executes, and Claude reviews the result. Provider selection, model selection, and richer
command-line configuration are not configurable yet.

## Prepare and run

The CLI supports Node.js 22.13 and later LTS lines, with development pinned to Node.js 24.
Install dependencies, build the application, and start the interactive prompt:

```sh
pnpm install
pnpm run build
pnpm start
```

Type a request at `>`. Press Ctrl+C while an agent is running to cancel that turn and return
to the prompt. Press Ctrl+C twice while idle to exit.

The configured Codex and Claude SDKs need valid credentials in the environment used to run
the CLI. Permission bypass is disabled by default. Set `HARNESS_AUTO_APPROVE=true` only when
running in a trusted workspace where provider commands may modify files or execute commands
without an approval prompt.

## Architecture

- `src/cli.ts` composes the harness agents and owns the terminal spinner and process lifecycle.
- `src/conversationLoop.ts` drives prompts, cancellation, progress callbacks, and per-turn
  usage reporting.
- `src/adapters/` adapts readline and `console` to the harness ports.
- `src/progressEventFormatter.ts` renders provider-independent `ProgressEvent` values.

The application depends on the public `Agent`, `ProgressEvent`, error, and composition APIs
from `@mikode13/harness`. It does not duplicate provider adapters or expose provider SDK
types as its own public API.

## Validation

```sh
pnpm run check
pnpm test
pnpm run build
```

The unit suite uses deterministic fakes and never contacts a provider. Coverage is available
with `pnpm run test:coverage`.

## License

This project is source-available under the MIT License with the
[Commons Clause License Condition v1.0](https://commonsclause.com/). See
[`LICENSE`](./LICENSE) for the complete text. It is not OSI open source: the Commons Clause
restricts selling the software or a service whose value derives substantially from it.

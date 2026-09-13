# @mikode13/harness-cli

An interactive command-line consumer for [`@mikode13/harness`](https://github.com/Mikode13/harness).
It provides a terminal experience for the harness's plan → execute → review workflow while
keeping provider orchestration in the harness library and terminal concerns in this project.

## Status

This is an early executable baseline. By default the interactive session runs the harness
workflow: Codex plans and executes, and Claude reviews the result. `--agent` replaces the
workflow with a single agent and accepts an optional model and reasoning effort. The
`single-turn` command executes exactly one agent, named with `--agent`, and exits.

## Prepare and run

The CLI supports Node.js 22.13 and later LTS lines, with development pinned to Node.js 24.
Install dependencies, build the application, and start the interactive session:

```sh
pnpm install
pnpm run build
pnpm start
```

Type a request at `>`. Press Ctrl+C while an agent is running to cancel that turn and return
to the prompt. Press Ctrl+C twice within three seconds while idle to exit.

The configured Codex and Claude SDKs need valid credentials in the environment used to run
the CLI. Permission bypass is disabled by default; both the interactive session and single-turn
runs enable it with `--auto-approve`, described below.

## Commands

`harness` without a command starts the interactive session. A command runs a single task and
exits, which is how the application is used from a script or a CI job. An unknown command is
rejected with exit code `2`.

Options given without a command configure the interactive session:

```sh
harness                                # the plan → execute → review workflow
harness --agent claude --model sonnet  # every prompt goes to one agent
```

Without `--agent`, the session runs the workflow. With `--agent`, every prompt goes straight to
that agent, which suits a simple task, trying a model, or working while the other provider is out
of quota. The session rejects `--model` and `--reasoning-effort` without `--agent`, because the
workflow chooses its own models, and rejects a prompt argument, because prompts are typed at `>`.

## Agent options

| Option               | Values                                                                                                           | Default                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `--agent`            | `claude`, `codex`                                                                                                | Required by `single-turn`; the session runs the workflow  |
| `--model`            | Claude: `haiku`, `sonnet`, `opus`, `fable`. Codex: `gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-luna`, `gpt-5.6-terra` | `opus` on Claude, `gpt-5.6-sol` on Codex; needs `--agent` |
| `--reasoning-effort` | `low`, `medium`, `high`, `xhigh`, `max`; Codex also accepts `ultra`                                              | `high`; needs `--agent`                                   |
| `--auto-approve`     | Flag                                                                                                             | Disabled                                                  |

The accepted models and reasoning efforts come from `@mikode13/harness` 1.0.0, which rejects any
other value with exit code `2`.

`--auto-approve` maps to the provider's permission-bypass mode: the agent may modify files and run
commands without asking, with the credentials and network access of the environment it runs in.
Pass it only when both the workspace and the whole prompt are trusted. Never combine it with
content an outside contributor controls, such as the diff of a pull request from a fork:
instructions hidden in that content could make the agent run commands with the job's secrets, and
a disposable checkout does not protect them.

## Single-turn runs

The `single-turn` command runs exactly one turn and exits:

```sh
harness single-turn --agent claude "Review this diff and answer APPROVE or REQUEST_CHANGES."
```

`--agent` is required. A single-turn run never falls back to a default agent, so the caller
always states which provider the run will spend.

Without `--auto-approve`, nobody is present to grant a permission the agent requests, and the
[harness decision log](https://github.com/Mikode13/harness/blob/main/docs/decisions.md) records
that such a run can stall instead of failing. Put what the agent needs, such as the diff, in the
prompt instead of asking it to run commands, and give the CI job a timeout, such as
`timeout-minutes` in GitHub Actions: the `SIGTERM` sent when it expires cancels the run.

The prompt must be a single quoted argument. Build it in the caller when it contains generated
content:

```sh
harness single-turn --agent claude "$(cat review-instructions.md)

$(git diff origin/main)"
```

### Output contract

stdout carries the JSON result and nothing else:

```json
{
	"response": "REQUEST_CHANGES: the retry policy is untested",
	"inputTokens": 12043,
	"outputTokens": 812,
	"duration": 47
}
```

Progress events, warnings, and failures are written to stderr, so the result survives a pipe:

```sh
verdict=$(harness single-turn --agent claude "$prompt" | jq -r .response)
```

The exit code is `0` when the agent answered, `1` when the run failed, and `2` when the command
line itself was rejected. `SIGINT` and `SIGTERM` cancel the run, which lets a cancelled CI job
stop the provider call instead of waiting for it.

## Architecture

- `src/cli.ts` is the entry point and sets the process exit code.
- `src/dispatch.ts` dispatches on the command: none, or only options, starts the interactive
  session, and `single-turn` runs one turn. It prints the usage for a rejected command line and
  maps each outcome to an exit code.
- `src/agentOptions.ts` parses the agent options both modes share.
- `src/repl.ts` composes the interactive session: it builds the workflow with
  `createOrchestrator`, or the agent named with `--agent` with `createAgent`, and owns the
  spinner in `src/spinner.ts` and the Ctrl+C handling.
- `src/conversationLoop.ts` drives prompts, cancellation, progress callbacks, and per-turn
  usage reporting.
- `src/singleTurn.ts` requires `--agent` and a prompt, builds the agent with `createAgent`,
  cancels on `SIGINT` and `SIGTERM`, and serializes the stdout contract.
- `src/adapters/` adapts readline and the console to the terminal ports.
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

`pnpm test` runs the unit suite and the integration suite, and neither contacts a provider. The
integration suite drives the command line through the real `@mikode13/harness`, replacing only
the Claude and Codex SDKs, and the terminal for the interactive session, with deterministic
fakes under `tests/support/fakes/`. Coverage is available with `pnpm run test:coverage`.

## License

This project is source-available under the MIT License with the
[Commons Clause License Condition v1.0](https://commonsclause.com/). See
[`LICENSE`](./LICENSE) for the complete text. It is not OSI open source: the Commons Clause
restricts selling the software or a service whose value derives substantially from it.

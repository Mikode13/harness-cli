# @mikode13/harness-cli

An interactive command-line consumer for [`@mikode13/harness`](https://github.com/Mikode13/harness).
It provides a terminal experience for the harness's plan → execute → review workflow while
keeping provider orchestration in the harness library and terminal concerns in this project.

## Status

Releases are published to npm as `@mikode13/harness-cli` and install the `harness-cli`
command. By default the interactive session runs the harness workflow: Codex plans and
executes, and Claude reviews the result. `--agent` replaces the workflow with a single agent
and accepts an optional model and reasoning effort. The `single-turn` command executes exactly
one agent, named with `--agent`, and exits. The command line, the single-turn stdout contract,
and the exit codes are the stable interface described in [Releases](#releases).

## Install

The CLI supports Node.js 22.13 and later LTS lines. Install the command globally and start the
interactive session:

```sh
npm install --global @mikode13/harness-cli
harness-cli
```

A CI job can run a pinned major version without a global install:

```sh
npx --yes @mikode13/harness-cli@1 single-turn --agent claude "$prompt"
```

pnpm works the same way, with `pnpm dlx` in place of `npx`. Installing globally with
`pnpm add --global` also needs pnpm's global bin directory on `PATH`, which `pnpm setup`
configures; without it pnpm fails with `ERR_PNPM_GLOBAL_BIN_DIR_NOT_IN_PATH`.

Type a request at `>`. Press Ctrl+C while an agent is running to cancel that turn and return
to the prompt. Press Ctrl+C twice within three seconds while idle to exit.

The configured Codex and Claude SDKs need valid credentials in the environment used to run
the CLI. Permission bypass is disabled by default; both the interactive session and single-turn
runs enable it with `--auto-approve`, described below.

## Commands

`harness-cli` without a command starts the interactive session. A command runs a single task
and exits, which is how the application is used from a script or a CI job. An unknown command is
rejected with exit code `2`.

Options given without a command configure the interactive session:

```sh
harness-cli                                # the plan → execute → review workflow
harness-cli --agent claude --model sonnet  # every prompt goes to one agent
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
harness-cli single-turn --agent claude "Review this diff and answer APPROVE or REQUEST_CHANGES."
```

`--agent` is required. A single-turn run never falls back to a default agent, so the caller
always states which provider the run will spend.

Without `--auto-approve`, nobody is present to grant a permission the agent requests, and the
[harness decision log](https://github.com/Mikode13/harness/blob/main/docs/decisions.md) records
that such a run can stall instead of failing. Put what the agent needs, such as the diff, in the
prompt instead of asking it to run commands, and give the CI job a timeout, such as
`timeout-minutes` in GitHub Actions: the `SIGTERM` sent when it expires cancels the run.

Short prompts can be passed as one quoted argument. Build larger or generated prompts in a file
and pass `--prompt-file` instead:

```sh
harness-cli single-turn --agent claude --prompt-file ./review-prompt.txt
```

The file is read as UTF-8. Use `--prompt-file -` to read the prompt from stdin:

```sh
cat review-prompt.txt | harness-cli single-turn --agent claude --prompt-file -
```

The positional prompt and `--prompt-file` are mutually exclusive. A prompt file avoids shell
quoting and operating-system argument-size limits, so it is the preferred form when the prompt
contains a diff or other generated content. The file path is resolved from the current working
directory. This option applies only to `single-turn`; the interactive session continues to read
prompts from its terminal.

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
verdict=$(harness-cli single-turn --agent claude "$prompt" | jq -r .response)
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
- `src/promptInput.ts` reads a single-turn prompt from a UTF-8 file or stdin.
- `src/adapters/` adapts readline and the console to the terminal ports.
- `src/progressEventFormatter.ts` renders provider-independent `ProgressEvent` values.

The application depends on the public `Agent`, `ProgressEvent`, error, and composition APIs
from `@mikode13/harness`. It does not duplicate provider adapters or expose provider SDK
types as its own public API.

## Development

Development is pinned to Node.js 24. Install dependencies, build the application, and start the
interactive session from the checkout:

```sh
pnpm install
pnpm run build
pnpm start
```

Validate a change with:

```sh
pnpm run check
pnpm test
pnpm run build
pnpm run pack:check
```

`pnpm test` runs the unit suite and the integration suite, and neither contacts a provider. The
integration suite drives the command line through the real `@mikode13/harness`, replacing only
the Claude and Codex SDKs, and the terminal for the interactive session, with deterministic
fakes under `tests/support/fakes/`. Coverage is available with `pnpm run test:coverage`.
`pnpm run pack:check` builds the package and verifies that the tarball contains exactly the
compiled JavaScript, the README, the license, and an executable `harness-cli` entry point.

## Releases

Releases are automatic. After CI passes on `main`, `.github/workflows/release.yml` runs the
MiKode release workflow: semantic-release derives the version from the squash commits since the
previous release, publishes it to npm with provenance through Trusted Publishing, and creates the
`v<version>` tag and a GitHub Release. `package.json` stays at `0.0.0-development`.

The Trusted Publisher on npmjs.com is registered for the package `@mikode13/harness-cli`, the
repository `Mikode13/harness-cli`, the workflow filename `release.yml`, and the environment
`npm` that the release job declares. Its allowed actions must include `npm publish`, because a
new configuration allows only `npm stage publish` while semantic-release publishes directly. npm
validates none of these fields when they are saved, so a mismatch first appears as a `404` from
the OIDC token exchange in the release job.

A `fix` releases a patch, a `feat` a minor version, and a breaking change a major version. The
command line, the single-turn stdout fields, and the exit codes are the public contract, so
changing or removing any of them is a breaking change.

## License

This project is source-available under the MIT License with the
[Commons Clause License Condition v1.0](https://commonsclause.com/). See
[`LICENSE`](./LICENSE) for the complete text. It is not OSI open source: the Commons Clause
restricts selling the software or a service whose value derives substantially from it.

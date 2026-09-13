# Decisions

## Keep the terminal consumer in its own repository

**Decision:** maintain the interactive command-line consumer as `@mikode13/harness-cli`, a
separate application repository that depends on `@mikode13/harness`.

**Context:** the harness package defines provider-agnostic agent contracts and orchestration.
Terminal input, progress rendering, process lifecycle, and provider composition are consumer
concerns; keeping them separate prevents a specific CLI interaction model from becoming part of
the published library seam.

**Consequences:** the CLI can evolve its command-line experience independently and can serve as a
real consumer of the public harness API. It must track released harness versions and own the SDK
credentials, provider configuration, and terminal-specific tests it needs.

## Make single-turn runs the automation surface

**Decision:** expose non-interactive work as named commands and start the interactive session
when no command is given. The first command, `single-turn`, runs one turn and exits, requires
`--agent` to name the single agent that runs, and prints the result to stdout as JSON while every
other output goes to stderr.

**Context:** the first automated consumer is a pull request reviewer running in CI. That consumer
needs one agent with an explicit prompt rather than the planner → executor → reviewer workflow, a
result it can parse without scraping terminal output, and an exit code it can fail the job on.
Making `--agent` required keeps provider spend an explicit decision of the caller and leaves room
for further agents without changing the invocation shape.

A bare positional prompt would make every future command ambiguous with a prompt, and a command
named after the transport, such as `cli`, or after a generic action, such as `run`, would not
distinguish this mode from the interactive session, which also runs agents. `single-turn` reuses
the harness vocabulary of turns. Dispatching on the command rather than on the presence of any
argument keeps options without a command available for configuring the interactive session.

**Consequences:** stdout is a published contract whose fields are listed explicitly, as recorded
in "List the `AgentResponse` fields explicitly on stdout". The interactive session and the
single-turn run share the agent contract and the progress formatter but not their composition, so
the interactive workflow can change without breaking automation. A prompt too large for a single
shell argument must be assembled by the caller, since the run does not read stdin.

## List the `AgentResponse` fields explicitly on stdout

**Decision:** `serializeResponse` destructures the fields of the output contract (`response`,
`inputTokens`, `outputTokens`, and `duration`) and serializes only those, rather than calling
`JSON.stringify` on the whole `AgentResponse`.

**Context:** serializing the whole object would silently swallow every property the harness adds
to `AgentResponse` later: it would reach CI consumers without anyone in this repository deciding
to publish it, including internal or bulky fields.

**Consequences:** the output changes only when this CLI changes it. A property the harness adds
stays out until it is added here deliberately, and a field renamed or removed in a harness major
release breaks compilation instead of silently changing the output. A unit test pins that no
other field is published.

## Enable permission bypass with an explicit flag

**Decision:** permission bypass is enabled per run with the `--auto-approve` option instead of the
`HARNESS_AUTO_APPROVE` environment variable. It stays disabled unless the option is passed.

**Context:** every other setting of a run, such as the agent, the model, and the reasoning effort,
is an option of the command, and a CI job passes configuration the same way it passes the prompt.
A flag keeps the setting in one mechanism and makes it visible in the command line that uses it.

**Consequences:** a bypass appears in shell history and CI logs next to the command that enabled
it, rather than in an environment set elsewhere. Copying a command also copies its bypass, so
examples and shared scripts include `--auto-approve` only when both the workspace and the prompt
are trusted; a prompt that carries an outside contributor's content, such as a pull request diff,
is not. The interactive session accepts the same flag.

## Share the agent options with the interactive session

**Decision:** the interactive session accepts the agent options of `single-turn`. Without
`--agent` it runs the orchestrator; with `--agent`, every turn goes to that agent with the
selected model and reasoning effort. `--model` and `--reasoning-effort` without `--agent` are
rejected with exit code `2`.

**Context:** the orchestrator is the wrong tool for a simple task or for trying a model, and it
cannot run while one of its providers is out of quota. One option vocabulary for both modes
keeps a command line meaningful in either. `--agent` keeps its `single-turn` meaning of one
agent: the harness can also run every orchestrator role on one provider, but selecting that with
`--agent` would give the same option two meanings, so it is deferred to its own option. The
orchestrator chooses its models per role, so ignoring `--model` there would misreport what runs.

**Consequences:** `src/agentOptions.ts` parses the shared options and each mode applies its own
rules on top. The orchestrator's models are not configurable from the command line, and running
the whole workflow on one provider needs a new option, which can be added without changing the
existing ones.

## Publish the CLI to npm as `harness-cli`

**Decision:** publish `@mikode13/harness-cli` to npm through the MiKode automated release
workflow, starting at `1.0.0`, with `harness-cli` as its command. The package ships only the
compiled JavaScript.

**Context:** the pull request reviewer runs in CI, where installing a pinned version from npm is
simpler and more reproducible than building this repository. The MiKode publication standard has
no automated `0.x` channel, so the first automated release of an unpublished package is `1.0.0`,
which commits to a stable command-line contract. A command named `harness` is generic enough to
collide with other tools installed globally, while `harness-cli` matches the package name. The
package has no importable API, so declarations would publish a contract nobody consumes, and
source maps would point to sources the package does not ship.

**Consequences:** the command line, the single-turn stdout fields, and the exit codes follow
Semantic Versioning, so changing or removing one requires a major release. npm and the Git tags
hold the version, and `package.json` stays at `0.0.0-development`. A fix in the harness, such as
the one for cancellation during a Claude review (Mikode13/harness#21), reaches users through a
dependency update in a new release of this package.

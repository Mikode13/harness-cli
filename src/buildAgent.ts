import { createAgent, createOrchestrator } from '@mikode13/harness';
import type { Agent } from '@mikode13/harness';
import { parseHarnessArgs } from './agentOptions.ts';
import { CliUsageError } from './errors.ts';

/** `--agent` talks to one agent directly; without it the session runs the orchestrator. */
export function buildAgent(args: readonly string[]): Agent {
	const { provider, model, reasoningEffort, autoApprove, promptFile } = parseHarnessArgs(args, {
		allowPositionals: false,
	}).options;

	if (promptFile !== undefined) {
		throw new CliUsageError('--prompt-file is only available with single-turn');
	}

	if (!provider) {
		// The orchestrator picks its own models, so ignoring these would misreport what runs.
		if (model !== undefined || reasoningEffort !== undefined) {
			throw new CliUsageError('--model and --reasoning-effort require --agent');
		}
		return createOrchestrator({ autoApprove });
	}

	return createAgent(provider, { model, reasoningEffort, autoApprove });
}

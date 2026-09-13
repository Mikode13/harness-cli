import { agentProviders, isAgentProvider } from '@mikode13/harness';
import type { ReasoningEffort, AgentModel, AgentProvider } from '@mikode13/harness';
import { parseArgs } from 'node:util';
import { CliUsageError } from './errors.ts';

/** The agent options shared by the interactive session and the `single-turn` command. */
export interface AgentOptions {
	provider?: AgentProvider;
	model?: AgentModel;
	reasoningEffort?: ReasoningEffort;
	autoApprove: boolean;
}

function parseOrReject(args: readonly string[], allowPositionals: boolean) {
	try {
		return parseArgs({
			args: [...args],
			options: {
				agent: { type: 'string' },
				'reasoning-effort': { type: 'string' },
				model: { type: 'string' },
				'auto-approve': { type: 'boolean' },
			},
			allowPositionals,
		});
	} catch (error) {
		throw new CliUsageError(error instanceof Error ? error.message : String(error));
	}
}

/**
 * Parses the agent options. Each caller decides whether `--agent` is required and what the
 * positionals mean; the harness validates the model and reasoning effort against the provider.
 *
 * @throws {CliUsageError} for an unknown option, a missing option value, an unexpected
 * positional, or an unknown agent.
 */
export function parseHarnessArgs(
	args: readonly string[],
	{ allowPositionals }: { allowPositionals: boolean },
): { options: AgentOptions; positionals: string[] } {
	const { values, positionals } = parseOrReject(args, allowPositionals);

	if (values.agent !== undefined && !isAgentProvider(values.agent)) {
		throw new CliUsageError(`Choose one of: ${agentProviders.join(', ')}`);
	}

	return {
		options: {
			provider: values.agent,
			model: values.model as AgentModel | undefined,
			reasoningEffort: values['reasoning-effort'] as ReasoningEffort | undefined,
			autoApprove: values['auto-approve'] ?? false,
		},
		positionals,
	};
}

import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import {
	createAgent,
	createOrchestrator,
	createLLMAgent,
	createLLMOrchestrator,
	createFileTools,
	isAgentProvider,
	isLLMModelOf,
	isLLMReasoningEffortOf,
	isModelOf,
	isReasoningEffortOf,
	type Agent,
	type AgentResponse,
	type RunOptions,
	type WorkspaceOptions,
} from '@mikode13/harness';

export interface RunPrompt {
	(prompt: string, options: RunOptions): Promise<AgentResponse>;
	engine?: string;
	supportsInbox?: boolean;
}

// The SDK names are existing CLI spellings. The current core selects both engines by provider.
export function localRunner(args: readonly string[]): RunPrompt {
	const { values } = parseArgs({
		args: [...args],
		options: {
			agent: { type: 'string' },
			model: { type: 'string' },
			'reasoning-effort': { type: 'string' },
			'auto-approve': { type: 'boolean' },
			llm: { type: 'boolean' },
		},
	});
	const provider =
		values.agent === 'codex' ? 'openai' : values.agent === 'claude' ? 'anthropic' : values.agent;
	if (provider !== undefined && !isAgentProvider(provider))
		throw new Error('Choose an agent: openai or anthropic');
	const effort = values['reasoning-effort'];
	const model = values.model;
	if (!provider && (model !== undefined || effort !== undefined))
		throw new Error('--model and --reasoning-effort require --agent');
	const autoApprove = values['auto-approve'] ?? false;
	const workspace: WorkspaceOptions = { roots: [{ path: process.cwd(), access: 'write' }] };
	const session = { id: randomUUID() };
	// Validate before opening the renderer. Open workspaces and initialize clients only on submit.
	let build: () => Agent | Promise<Agent>;
	if (!provider) {
		build = () =>
			values.llm
				? createLLMOrchestrator({ workspace, autoApprove })
				: createOrchestrator({ autoApprove });
	} else if (values.llm) {
		if (model !== undefined && !isLLMModelOf(provider, model))
			throw new Error('Unsupported model for this provider');
		if (effort !== undefined && !isLLMReasoningEffortOf(provider, effort))
			throw new Error('Unsupported reasoning effort');
		build = async () =>
			createLLMAgent(provider, {
				model,
				reasoningEffort: effort,
				autoApprove,
				workspace,
				tools: await createFileTools(provider, workspace),
				systemPrompt: 'You are Uróboros, a coding assistant working in the current checkout.',
			});
	} else {
		if (model !== undefined && !isModelOf(provider, model))
			throw new Error('Unsupported model for this provider');
		if (effort !== undefined && !isReasoningEffortOf(provider, effort))
			throw new Error('Unsupported reasoning effort');
		build = () => createAgent(provider, { model, reasoningEffort: effort, autoApprove });
	}
	let agent: Agent | undefined;
	const run: RunPrompt = async (prompt, options) => {
		agent ??= await build();
		options.signal.throwIfAborted();
		return agent.run(prompt, { ...options, session });
	};
	run.engine = (values.llm ? 'Model API' : 'Agent SDK') + ' · ' + (provider ?? 'Orchestrator');
	run.supportsInbox = Boolean(values.llm && provider);
	return run;
}

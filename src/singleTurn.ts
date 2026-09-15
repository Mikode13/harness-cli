import { createAgent } from '@mikode13/harness';
import type { AgentResponse } from '@mikode13/harness';
import { formatProgressEvent } from './progressEventFormatter.ts';
import { CliUsageError } from './errors.ts';
import { Output } from './adapters/output.ts';
import { parseHarnessArgs } from './agentOptions.ts';
import { readPromptFile } from './promptInput.ts';

function getAgentsConfig(args: readonly string[]) {
	const { options, positionals } = parseHarnessArgs(args, { allowPositionals: true });
	const { provider, model, reasoningEffort, autoApprove, promptFile } = options;

	if (!provider) {
		throw new CliUsageError('Agent is a required argument');
	}

	const [prompt, ...extraPrompts] = positionals;

	if (promptFile !== undefined && positionals.length > 0) {
		throw new CliUsageError(
			'Provide the prompt either positionally or with --prompt-file, not both',
		);
	}

	if (extraPrompts.length > 0) {
		throw new CliUsageError('Expected a single prompt. Quote it as one argument.');
	}

	if (promptFile === '') {
		throw new CliUsageError('--prompt-file requires a path or - for stdin');
	}

	if (promptFile === undefined && (!prompt || prompt.trim() === '')) {
		throw new CliUsageError("The prompt can't be empty");
	}

	return { provider, model, reasoningEffort, autoApprove, prompt, promptFile };
}

function serializeResponse({ duration, inputTokens, outputTokens, response }: AgentResponse) {
	return JSON.stringify({
		duration,
		inputTokens,
		outputTokens,
		response,
	});
}

export async function start(args: readonly string[]) {
	const {
		provider,
		autoApprove,
		model,
		prompt: positionalPrompt,
		promptFile,
		reasoningEffort,
	} = getAgentsConfig(args);
	const output = new Output();

	// Ctrl+C sends SIGINT and a cancelled CI job sends SIGTERM. `once` leaves a second signal to
	// Node's default handler, so a run that ignores the abort can still be killed.
	const abortController = new AbortController();

	const abort = (): void => {
		abortController.abort();
	};
	process.once('SIGINT', abort);
	process.once('SIGTERM', abort);

	try {
		const prompt =
			promptFile === undefined
				? positionalPrompt
				: await readPromptFile(promptFile, abortController.signal);
		if (prompt === undefined || prompt.trim() === '') {
			throw new CliUsageError("The prompt can't be empty");
		}

		const aiAgent = createAgent(provider, { model, reasoningEffort, autoApprove });
		const response = await aiAgent.run(prompt, abortController.signal, item => {
			const message = formatProgressEvent(item);
			if (message) {
				process.stderr.write(`${message}\n`);
			}
		});

		// A provider can end a cancelled turn without an error, as Claude does. Report it as the
		// cancellation it is, not as a run that produced no response.
		abortController.signal.throwIfAborted();

		if (!response) {
			throw new Error('The response from the agent is empty');
		}

		output.print(serializeResponse(response));
	} finally {
		process.off('SIGINT', abort);
		process.off('SIGTERM', abort);
	}
}

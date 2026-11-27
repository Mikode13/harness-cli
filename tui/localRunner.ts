import { buildAgent } from '../src/buildAgent.ts';
import { formatProgressEvent } from '../src/progressEventFormatter.ts';

export type RunPrompt = (
	prompt: string,
	signal: AbortSignal,
	activity: (message: string) => void,
) => Promise<string>;

export function localRunner(args: readonly string[]): RunPrompt {
	const agent = buildAgent(args);
	return async (prompt, signal, activity) => {
		const result = await agent.run(prompt, signal, event => {
			const message = formatProgressEvent(event);
			if (message) activity(message);
		});
		signal.throwIfAborted();
		if (!result) throw new Error('The agent returned no response.');
		return result.response;
	};
}

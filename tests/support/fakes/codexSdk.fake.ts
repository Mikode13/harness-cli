/**
 * Stands in for `@openai/codex-sdk`, the Codex provider boundary. The integration project
 * aliases the SDK to this module, so the real harness engine runs against scripted turns.
 */

type ThreadEvent = Record<string, unknown>;

interface ScriptedTurn {
	events: ThreadEvent[];
	runUntilAborted: boolean;
}

const turns: ScriptedTurn[] = [];
const threads: Record<string, unknown>[] = [];
const prompts: string[] = [];

function abortError(): DOMException {
	return new DOMException('The operation was aborted', 'AbortError');
}

// Like the SDK, whose process is spawned with the signal: an abort rejects with an AbortError.
async function* play(
	turn: ScriptedTurn,
	signal: AbortSignal | undefined,
): AsyncGenerator<ThreadEvent> {
	yield* turn.events;
	if (turn.runUntilAborted) {
		await new Promise<never>((_resolve, reject) => {
			if (signal?.aborted) {
				reject(abortError());
				return;
			}
			signal?.addEventListener(
				'abort',
				() => {
					reject(abortError());
				},
				{ once: true },
			);
		});
	}
}

class ScriptedThread {
	runStreamed(
		prompt: string,
		{ signal }: { signal?: AbortSignal } = {},
	): Promise<{ events: AsyncGenerator<ThreadEvent> }> {
		prompts.push(prompt);
		const turn = turns.shift();
		if (!turn) {
			return Promise.reject(new Error('No Codex turn was scripted for this call'));
		}
		return Promise.resolve({ events: play(turn, signal) });
	}
}

export class Codex {
	startThread(options: Record<string, unknown> = {}): ScriptedThread {
		threads.push(options);
		return new ScriptedThread();
	}
}

function completed(item: Record<string, unknown>): ThreadEvent {
	return { type: 'item.completed', item };
}

export const codexSdk = {
	/** The options of every thread the harness started, in order. */
	threads: threads as readonly Record<string, unknown>[],
	/** Every prompt the harness sent, in order. */
	prompts: prompts as readonly string[],

	/** Scripts a successful turn: optional reasoning, the answer, then the usage. */
	respond(answer: string, { reasoning }: { reasoning?: string } = {}): void {
		turns.push({
			runUntilAborted: false,
			events: [
				{ type: 'turn.started' },
				...(reasoning ? [completed({ id: 'item-1', type: 'reasoning', text: reasoning })] : []),
				completed({ id: 'item-2', type: 'agent_message', text: answer }),
				{
					type: 'turn.completed',
					usage: { input_tokens: 200, cached_input_tokens: 0, output_tokens: 40 },
				},
			],
		});
	},

	/** Scripts a turn the SDK reports as failed, which the harness classifies as unrecoverable. */
	failTurn(message: string): void {
		turns.push({
			runUntilAborted: false,
			events: [{ type: 'turn.started' }, { type: 'turn.failed', error: { message } }],
		});
	},

	/** Scripts a turn that reasons and then keeps running until its signal aborts. */
	runUntilAborted(): void {
		turns.push({
			runUntilAborted: true,
			events: [
				{ type: 'turn.started' },
				completed({ id: 'item-1', type: 'reasoning', text: 'reading the repository' }),
			],
		});
	},

	reset(): void {
		turns.length = 0;
		threads.length = 0;
		prompts.length = 0;
	},
};

/**
 * Stands in for `@anthropic-ai/claude-agent-sdk`, the Claude provider boundary. The integration
 * project aliases the SDK to this module, so the real harness engine runs against scripted turns.
 */

type Message = Record<string, unknown>;

interface QueryCall {
	prompt: string;
	options: Record<string, unknown>;
}

interface ScriptedTurn {
	messages: Message[];
	runUntilClosed: boolean;
}

const sessionId = 'claude-session-1';
const turns: ScriptedTurn[] = [];
const calls: QueryCall[] = [];

class ScriptedQuery implements AsyncIterable<Message> {
	readonly #turn: ScriptedTurn;
	#closed = false;
	#release: (() => void) | undefined;

	constructor(turn: ScriptedTurn) {
		this.#turn = turn;
	}

	async *[Symbol.asyncIterator](): AsyncGenerator<Message> {
		yield* this.#turn.messages;
		if (this.#turn.runUntilClosed && !this.#closed) {
			await new Promise<void>(resolve => {
				this.#release = resolve;
			});
		}
	}

	// Like the SDK, closing ends the stream: no further messages, and no error.
	close(): void {
		this.#closed = true;
		this.#release?.();
	}
}

export function query({
	prompt,
	options = {},
}: {
	prompt: string;
	options?: Record<string, unknown>;
}): ScriptedQuery {
	calls.push({ prompt, options });
	const turn = turns.shift();
	if (!turn) {
		throw new Error('No Claude turn was scripted for this call');
	}
	return new ScriptedQuery(turn);
}

function assistant(content: Message[]): Message {
	return { type: 'assistant', session_id: sessionId, message: { content } };
}

export const claudeSdk = {
	/** Every `query` call the harness made, in order. */
	calls: calls as readonly QueryCall[],

	/** Scripts a successful turn: optional reasoning, the answer, then the result with usage. */
	respond(answer: string, { reasoning }: { reasoning?: string } = {}): void {
		turns.push({
			runUntilClosed: false,
			messages: [
				...(reasoning ? [assistant([{ type: 'thinking', thinking: reasoning }])] : []),
				assistant([{ type: 'text', text: answer }]),
				{
					type: 'result',
					subtype: 'success',
					session_id: sessionId,
					result: answer,
					usage: { input_tokens: 120, output_tokens: 30 },
					duration_ms: 1500,
				},
			],
		});
	},

	/** Scripts a turn the SDK reports as failed, which the harness classifies as recoverable. */
	fail(): void {
		turns.push({
			runUntilClosed: false,
			messages: [
				{
					type: 'result',
					subtype: 'error_during_execution',
					session_id: sessionId,
					stop_reason: null,
					terminal_reason: 'error',
					errors: ['overloaded'],
				},
			],
		});
	},

	/** Scripts a turn that reasons and then keeps running until the harness closes the stream. */
	runUntilClosed(): void {
		turns.push({
			runUntilClosed: true,
			messages: [assistant([{ type: 'thinking', thinking: 'reading the repository' }])],
		});
	},

	reset(): void {
		turns.length = 0;
		calls.length = 0;
	},
};

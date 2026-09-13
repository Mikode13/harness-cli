import { vi } from 'vitest';

function abortError(): DOMException {
	return new DOMException('The operation was aborted', 'AbortError');
}

/**
 * Stands in for a `node:readline/promises` interface on a terminal, the interactive session's
 * outer boundary: it answers prompts with typed lines and delivers Ctrl+C.
 */
export class FakeTerminal {
	/** Every prompt the session showed, in order. */
	readonly prompts: string[] = [];
	closed = false;
	readonly #typed: string[] = [];
	readonly #interruptListeners: (() => void)[] = [];
	#answer: ((line: string) => void) | undefined;

	/** Types a line: it answers the pending prompt, or the next one. */
	type(line: string): void {
		const answer = this.#answer;
		if (answer) {
			this.#answer = undefined;
			answer(line);
			return;
		}
		this.#typed.push(line);
	}

	pressCtrlC(): void {
		for (const listener of this.#interruptListeners) {
			listener();
		}
	}

	/** Resolves once the session has shown its `count`-th prompt and is waiting for input. */
	async waitForPrompt(count: number): Promise<void> {
		await vi.waitFor(() => {
			if (this.prompts.length < count || !this.#answer) {
				throw new Error(`The session is not waiting at prompt ${String(count)}`);
			}
		});
	}

	question(query: string, { signal }: { signal?: AbortSignal } = {}): Promise<string> {
		this.prompts.push(query);
		const typed = this.#typed.shift();
		if (typed !== undefined) {
			return Promise.resolve(typed);
		}
		return new Promise((resolve, reject) => {
			if (signal?.aborted) {
				reject(abortError());
				return;
			}
			this.#answer = resolve;
			signal?.addEventListener(
				'abort',
				() => {
					this.#answer = undefined;
					reject(abortError());
				},
				{ once: true },
			);
		});
	}

	on(event: string, listener: () => void): this {
		if (event === 'SIGINT') {
			this.#interruptListeners.push(listener);
		}
		return this;
	}

	close(): void {
		this.closed = true;
	}
}

let terminal = new FakeTerminal();

/** Gives the next session a fresh terminal. */
export function useTerminal(): FakeTerminal {
	terminal = new FakeTerminal();
	return terminal;
}

export const createInterface = vi.fn(() => terminal);

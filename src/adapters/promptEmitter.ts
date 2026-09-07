import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import type { IPromptEmitter } from '../promptEmitter.ts';

export class PromptEmitter implements IPromptEmitter {
	private readonly rl: readline.Interface;

	constructor() {
		this.rl = readline.createInterface({ input, output });
	}

	emit(prompt: string, signal: AbortSignal): Promise<string> {
		return this.rl.question(prompt, { signal });
	}

	// Registering a 'SIGINT' listener directly on readline keeps Ctrl+C under the loop's control.
	onInterrupt(listener: () => void): () => void {
		this.rl.on('SIGINT', listener);
		return () => {
			this.rl.off('SIGINT', listener);
		};
	}

	close(): void {
		this.rl.close();
	}
}

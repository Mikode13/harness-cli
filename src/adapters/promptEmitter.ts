import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import type { IPromptEmitter } from '../promptEmitter.ts';

export class PromptEmitter implements IPromptEmitter {
	private readonly rl: readline.Interface;

	constructor(onCancel: () => void) {
		this.rl = readline.createInterface({ input, output });
		this.rl.on('SIGINT', onCancel);
	}

	emit(prompt: string, signal: AbortSignal): Promise<string> {
		return this.rl.question(prompt, { signal });
	}

	close(): void {
		this.rl.close();
	}
}

import type { IOutput } from '../output.ts';

export class Output implements IOutput {
	print(message: string): void {
		console.log(message);
	}

	printError(error: unknown): void {
		console.error(error);
	}
}

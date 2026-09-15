import { readFile } from 'node:fs/promises';
import { isAbortError } from '@mikode13/harness';
import { CliUsageError } from './errors.ts';

interface PromptInput extends AsyncIterable<string | Uint8Array> {
	destroy(error?: Error): void;
}

/** Reads a prompt from a file, or from stdin when the path is `-`. */
export async function readPromptFile(
	path: string,
	signal: AbortSignal,
	input: PromptInput = process.stdin,
): Promise<string> {
	try {
		if (path === '-') {
			return await readPromptFromStdin(signal, input);
		}

		return await readFile(path, { encoding: 'utf8', signal });
	} catch (error) {
		// Preserve cancellation so dispatch can report it with the same exit code as a cancelled
		// provider run. Other input failures are rejected command lines, not provider failures.
		if (isAbortError(error)) {
			throw error;
		}

		const reason = error instanceof Error ? `: ${error.message}` : '';
		const source = path === '-' ? 'stdin' : `file "${path}"`;
		throw new CliUsageError(`Unable to read prompt from ${source}${reason}`);
	}
}

async function readPromptFromStdin(signal: AbortSignal, input: PromptInput): Promise<string> {
	const chunks: Buffer[] = [];
	const abort = (): void => {
		input.destroy(signal.reason instanceof Error ? signal.reason : undefined);
	};

	signal.throwIfAborted();
	signal.addEventListener('abort', abort, { once: true });
	try {
		for await (const chunk of input) {
			chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk));
		}
		return Buffer.concat(chunks).toString('utf8');
	} finally {
		signal.removeEventListener('abort', abort);
	}
}

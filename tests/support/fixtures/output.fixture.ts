import { vi } from 'vitest';

export interface CapturedOutput {
	/** Everything written to stdout, in order. */
	stdout(): string;
	/** Everything written to stderr, in order. */
	stderr(): string;
}

/**
 * Captures the process output as a terminal or a CI log receives it: `console.log` and
 * `process.stdout` reach stdout; `console.error`, `console.warn`, and `process.stderr` reach
 * stderr.
 */
export function captureOutput(): CapturedOutput {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const print =
		(into: string[]) =>
		(...args: unknown[]): void => {
			into.push(`${args.map(String).join(' ')}\n`);
		};
	const write =
		(into: string[]) =>
		(chunk: string | Uint8Array): boolean => {
			into.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
			return true;
		};

	vi.spyOn(console, 'log').mockImplementation(print(stdout));
	vi.spyOn(console, 'error').mockImplementation(print(stderr));
	vi.spyOn(console, 'warn').mockImplementation(print(stderr));
	vi.spyOn(process.stdout, 'write').mockImplementation(write(stdout));
	vi.spyOn(process.stderr, 'write').mockImplementation(write(stderr));

	return { stdout: () => stdout.join(''), stderr: () => stderr.join('') };
}

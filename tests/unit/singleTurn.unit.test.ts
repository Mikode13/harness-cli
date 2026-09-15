import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type * as Harness from '@mikode13/harness';
import type { Agent, AgentResponse, ProgressEvent } from '@mikode13/harness';
import { UnrecoverableError, createAgent } from '@mikode13/harness';
import { CliUsageError } from '../../src/errors.js';
import { readPromptFile } from '../../src/promptInput.js';
import { start } from '../../src/singleTurn.js';

// createAgent is the provider boundary: the real one would build an SDK client and spend
// provider usage, so every test replaces it with an agent it controls.
vi.mock('@mikode13/harness', async importOriginal => ({
	...(await importOriginal<typeof Harness>()),
	createAgent: vi.fn(),
}));

function response(overrides: Partial<AgentResponse> = {}): AgentResponse {
	return {
		response: 'REQUEST_CHANGES\n\n- the retry policy is untested',
		inputTokens: 3,
		outputTokens: 5,
		duration: 2,
		...overrides,
	};
}

function useAgent(run: Agent['run']) {
	const runMock = vi.fn(run);
	vi.mocked(createAgent).mockReturnValue({ run: runMock });
	return runMock;
}

let stdout: MockInstance<typeof console.log>;
let temporaryDirectory: string;

beforeEach(async () => {
	temporaryDirectory = await mkdtemp(join(tmpdir(), 'harness-cli-'));
});

afterEach(async () => {
	await rm(temporaryDirectory, { recursive: true, force: true });
});

function stdoutLines(): string[] {
	return stdout.mock.calls.map(call => String(call[0]));
}

beforeEach(() => {
	vi.mocked(createAgent).mockReset();
	vi.restoreAllMocks();
	stdout = vi.spyOn(console, 'log').mockImplementation(() => undefined);
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
	vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

describe('single-turn usage errors', () => {
	it('rejects a run without --agent', async () => {
		await expect(start(['review this diff'])).rejects.toBeInstanceOf(CliUsageError);
		expect(createAgent).not.toHaveBeenCalled();
	});

	it('rejects an unknown agent', async () => {
		await expect(start(['--agent', 'gemini', 'review this diff'])).rejects.toBeInstanceOf(
			CliUsageError,
		);
		expect(createAgent).not.toHaveBeenCalled();
	});

	it('rejects a run without a prompt', async () => {
		await expect(start(['--agent', 'claude'])).rejects.toBeInstanceOf(CliUsageError);
		expect(createAgent).not.toHaveBeenCalled();
	});

	it('rejects a prompt made only of whitespace', async () => {
		await expect(start(['--agent', 'claude', '   '])).rejects.toBeInstanceOf(CliUsageError);
		expect(createAgent).not.toHaveBeenCalled();
	});

	it('rejects an unknown option as a usage error', async () => {
		await expect(start(['--json', '--agent', 'claude', 'review this diff'])).rejects.toBeInstanceOf(
			CliUsageError,
		);
	});

	it('rejects an unquoted prompt instead of sending only its first word', async () => {
		useAgent(() => Promise.resolve(response()));

		await expect(start(['--agent', 'claude', 'review', 'this', 'diff'])).rejects.toBeInstanceOf(
			CliUsageError,
		);
	});

	it('rejects a positional prompt together with --prompt-file', async () => {
		await expect(
			start(['--agent', 'claude', '--prompt-file', 'prompt.txt', 'review this diff']),
		).rejects.toBeInstanceOf(CliUsageError);
		expect(createAgent).not.toHaveBeenCalled();
	});

	it('rejects an empty --prompt-file value', async () => {
		await expect(start(['--agent', 'claude', '--prompt-file', ''])).rejects.toBeInstanceOf(
			CliUsageError,
		);
	});
});

describe('single-turn prompt files', () => {
	it('reads and forwards a prompt from a file', async () => {
		const path = join(temporaryDirectory, 'prompt.txt');
		await writeFile(path, 'review this diff from a file', 'utf8');
		const run = useAgent(prompt => {
			expect(prompt).toBe('review this diff from a file');
			return Promise.resolve(response());
		});

		await start(['--agent', 'claude', '--prompt-file', path]);

		expect(run).toHaveBeenCalledOnce();
	});

	it('rejects a missing prompt file as a usage error', async () => {
		await expect(
			start(['--agent', 'claude', '--prompt-file', join(temporaryDirectory, 'missing.txt')]),
		).rejects.toThrow('Unable to read prompt from file');
		expect(createAgent).not.toHaveBeenCalled();
	});

	it('rejects a whitespace-only prompt file', async () => {
		const path = join(temporaryDirectory, 'prompt.txt');
		await writeFile(path, ' \n\t', 'utf8');

		await expect(start(['--agent', 'claude', '--prompt-file', path])).rejects.toBeInstanceOf(
			CliUsageError,
		);
		expect(createAgent).not.toHaveBeenCalled();
	});

	it('forwards a prompt larger than the per-argument operating-system limit', async () => {
		const prompt = 'x'.repeat(128 * 1024 + 1);
		const path = join(temporaryDirectory, 'large-prompt.txt');
		await writeFile(path, prompt, 'utf8');
		const run = useAgent(received => {
			expect(received).toBe(prompt);
			return Promise.resolve(response());
		});

		await start(['--agent', 'claude', '--prompt-file', path]);

		expect(run).toHaveBeenCalledOnce();
	});
});

describe('stdin prompt files', () => {
	it('reads UTF-8 prompt content from stdin', async () => {
		const input = Readable.from(['revisa este diff: ', 'áéíóú']);

		await expect(readPromptFile('-', new AbortController().signal, input)).resolves.toBe(
			'revisa este diff: áéíóú',
		);
	});

	it('stops reading stdin when the signal is aborted', async () => {
		const controller = new AbortController();
		const input = new Readable({
			read() {
				// Keep the input open until the caller cancels it.
			},
		});
		const reading = readPromptFile('-', controller.signal, input);
		controller.abort();

		await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
	});
});

describe('single-turn run', () => {
	it('builds the selected agent and runs the prompt on it', async () => {
		const run = useAgent(() => Promise.resolve(response()));

		await start(['--agent', 'claude', 'review this diff']);

		expect(createAgent).toHaveBeenCalledWith('claude', expect.anything());
		expect(run).toHaveBeenCalledWith(
			'review this diff',
			expect.any(AbortSignal),
			expect.any(Function),
		);
	});

	it('writes the result to stdout as a single JSON line', async () => {
		useAgent(() => Promise.resolve(response()));

		await start(['--agent', 'claude', 'review this diff']);

		const [line = '', ...otherLines] = stdoutLines();
		expect(otherLines).toEqual([]);
		expect(line).not.toContain('\n');
		expect(JSON.parse(line)).toEqual({
			response: 'REQUEST_CHANGES\n\n- the retry policy is untested',
			inputTokens: 3,
			outputTokens: 5,
			duration: 2,
		});
	});

	it('publishes only the fields of the output contract', async () => {
		useAgent(() => Promise.resolve({ ...response(), sessionId: 'internal-only' }));

		await start(['--agent', 'claude', 'review this diff']);

		const [line = ''] = stdoutLines();
		expect(JSON.parse(line)).not.toHaveProperty('sessionId');
	});

	it('keeps progress out of stdout so the result stays parseable', async () => {
		const progress: ProgressEvent = { type: 'reasoning', message: 'inspecting the diff' };
		useAgent((_prompt, _signal, callback) => {
			callback(progress);
			return Promise.resolve(response());
		});

		await start(['--agent', 'claude', 'review this diff']);

		const [line = '', ...otherLines] = stdoutLines();
		expect(otherLines).toEqual([]);
		expect(() => {
			JSON.parse(line);
		}).not.toThrow();
	});
});

describe('single-turn failures', () => {
	it('fails without writing a result when the agent finishes without a response', async () => {
		useAgent(() => Promise.resolve(undefined));

		const run = start(['--agent', 'claude', 'review this diff']);

		await expect(run).rejects.toThrow();
		await expect(run).rejects.not.toBeInstanceOf(CliUsageError);
		expect(stdout).not.toHaveBeenCalled();
	});

	it('propagates an agent failure without writing a result', async () => {
		const failure = new UnrecoverableError('cannot continue', { cause: 'fatal' });
		useAgent(() => Promise.reject(failure));

		await expect(start(['--agent', 'claude', 'review this diff'])).rejects.toBe(failure);
		expect(stdout).not.toHaveBeenCalled();
	});
});

describe('single-turn cancellation', () => {
	function waitForAbort(): Agent['run'] {
		return (_prompt, signal) =>
			new Promise((_resolve, reject) => {
				signal.addEventListener('abort', () => {
					reject(new DOMException('The operation was aborted', 'AbortError'));
				});
			});
	}

	it.each(['SIGINT', 'SIGTERM'] as const)(
		'aborts the run when the process receives %s',
		async signal => {
			useAgent(waitForAbort());
			const listenersBefore = new Set(process.listeners(signal));

			const run = start(['--agent', 'claude', 'review this diff']);
			const added = process.listeners(signal).filter(listener => !listenersBefore.has(listener));
			// Calling the listener directly avoids emitting the signal to the test runner's own handlers.
			added.forEach(listener => {
				listener(signal);
			});

			expect(added).toHaveLength(1);
			await expect(run).rejects.toMatchObject({ name: 'AbortError' });
			expect(stdout).not.toHaveBeenCalled();
		},
	);

	it('reports a cancelled run as cancelled when the agent ends it without an error', async () => {
		// Claude ends a closed stream quietly instead of rejecting with an AbortError.
		useAgent(
			(_prompt, signal) =>
				new Promise(resolve => {
					signal.addEventListener('abort', () => {
						resolve(undefined);
					});
				}),
		);
		const listenersBefore = new Set(process.listeners('SIGINT'));

		const run = start(['--agent', 'claude', 'review this diff']);
		process
			.listeners('SIGINT')
			.filter(listener => !listenersBefore.has(listener))
			.forEach(listener => {
				listener('SIGINT');
			});

		await expect(run).rejects.toMatchObject({ name: 'AbortError' });
		expect(stdout).not.toHaveBeenCalled();
	});

	it('removes its signal listeners once the run settles', async () => {
		useAgent(() => Promise.resolve(response()));
		const sigintListeners = process.listenerCount('SIGINT');
		const sigtermListeners = process.listenerCount('SIGTERM');

		await start(['--agent', 'claude', 'review this diff']);

		expect(process.listenerCount('SIGINT')).toBe(sigintListeners);
		expect(process.listenerCount('SIGTERM')).toBe(sigtermListeners);
	});
});

describe('single-turn options', () => {
	it('passes the model, reasoning effort, and permission bypass to the agent', async () => {
		useAgent(() => Promise.resolve(response()));

		await start([
			'--agent',
			'codex',
			'--model',
			'gpt-5.6-luna',
			'--reasoning-effort',
			'xhigh',
			'--auto-approve',
			'review this diff',
		]);

		expect(createAgent).toHaveBeenCalledWith('codex', {
			model: 'gpt-5.6-luna',
			reasoningEffort: 'xhigh',
			autoApprove: true,
		});
	});

	it('leaves the permission bypass off unless --auto-approve is passed', async () => {
		useAgent(() => Promise.resolve(response()));

		await start(['--agent', 'claude', 'review this diff']);

		const [, options] = vi.mocked(createAgent).mock.calls[0] ?? [];
		expect(options?.autoApprove).toBeFalsy();
	});
});

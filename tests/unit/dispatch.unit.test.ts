import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { InvalidAgentConfigError, UnrecoverableError } from '@mikode13/harness';
import { dispatch } from '../../src/dispatch.js';
import { CliUsageError } from '../../src/errors.js';
import { Repl } from '../../src/repl.js';
import { start as startSingleTurn } from '../../src/singleTurn.js';

const startRepl = vi.hoisted(() => vi.fn(() => Promise.resolve()));

// Both modes reach a terminal or a provider, so these tests replace them and check only how the
// command line and the outcome of a mode become an exit code.
vi.mock('../../src/repl.js', () => ({
	Repl: vi.fn(function () {
		return { start: startRepl };
	}),
}));
vi.mock('../../src/singleTurn.js', () => ({ start: vi.fn() }));

let stderr: MockInstance<typeof console.error>;

function stderrText(): string {
	return stderr.mock.calls.map(call => String(call[0])).join('\n');
}

function printedOnlyText(): boolean {
	return stderr.mock.calls.every(call => typeof call[0] === 'string');
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(startSingleTurn).mockReset();
	vi.restoreAllMocks();
	stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('dispatch', () => {
	it('starts the interactive session when no command is given', async () => {
		await expect(dispatch([])).resolves.toBe(0);

		expect(Repl).toHaveBeenCalledWith([]);
		expect(startRepl).toHaveBeenCalledOnce();
		expect(startSingleTurn).not.toHaveBeenCalled();
	});

	it('passes options given without a command to the interactive session', async () => {
		await expect(dispatch(['--agent', 'claude', '--model', 'sonnet'])).resolves.toBe(0);

		expect(Repl).toHaveBeenCalledWith(['--agent', 'claude', '--model', 'sonnet']);
		expect(startSingleTurn).not.toHaveBeenCalled();
	});

	it('runs single-turn with the arguments that follow the command', async () => {
		await expect(dispatch(['single-turn', '--agent', 'claude', 'review this diff'])).resolves.toBe(
			0,
		);

		expect(startSingleTurn).toHaveBeenCalledWith(['--agent', 'claude', 'review this diff']);
		expect(Repl).not.toHaveBeenCalled();
	});

	it.each([
		['a usage error', new CliUsageError('Agent is a required argument')],
		['an unsupported model', new InvalidAgentConfigError('"gpt-4" is not a Claude model')],
	])('exits with 2 and prints the usage for %s, without a stack trace', async (_case, error) => {
		vi.mocked(startSingleTurn).mockRejectedValue(error);

		await expect(dispatch(['single-turn'])).resolves.toBe(2);

		expect(stderrText()).toContain(error.message);
		expect(stderrText()).toContain('Usage:');
		expect(printedOnlyText()).toBe(true);
	});

	it('exits with 2 and prints the usage when the interactive session rejects its options', async () => {
		const rejection = new CliUsageError('--model and --reasoning-effort require --agent');
		vi.mocked(Repl).mockImplementationOnce(function () {
			throw rejection;
		});

		await expect(dispatch(['--model', 'sonnet'])).resolves.toBe(2);

		expect(stderrText()).toContain(rejection.message);
		expect(stderrText()).toContain('Usage:');
		expect(printedOnlyText()).toBe(true);
		expect(startRepl).not.toHaveBeenCalled();
	});

	it('exits with 1 when the run fails', async () => {
		const failure = new UnrecoverableError('cannot continue', { cause: 'fatal' });
		vi.mocked(startSingleTurn).mockRejectedValue(failure);

		await expect(dispatch(['single-turn', '--agent', 'claude', 'review this diff'])).resolves.toBe(
			1,
		);

		expect(stderr).toHaveBeenCalledWith(failure);
	});

	it('exits with 1 and reports a cancelled run without a stack trace', async () => {
		vi.mocked(startSingleTurn).mockRejectedValue(
			new DOMException('The operation was aborted', 'AbortError'),
		);

		await expect(dispatch(['single-turn', '--agent', 'claude', 'review this diff'])).resolves.toBe(
			1,
		);

		expect(stderrText()).toBe('Cancelled.');
	});

	it('exits with 2 and prints the usage for an unknown command', async () => {
		await expect(dispatch(['loquesea'])).resolves.toBe(2);

		expect(stderrText()).toContain('Unknown command "loquesea".');
		expect(stderrText()).toContain('Usage:');
		expect(Repl).not.toHaveBeenCalled();
		expect(startSingleTurn).not.toHaveBeenCalled();
	});
});

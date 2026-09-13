import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatch } from '../../src/dispatch.js';
import { claudeSdk } from '../support/fakes/claudeAgentSdk.fake.js';
import { codexSdk } from '../support/fakes/codexSdk.fake.js';
import { captureOutput, type CapturedOutput } from '../support/fixtures/output.fixture.js';

// Everything from the command line to the provider engines is real. vitest.config.ts aliases only
// the provider SDKs to fakes, so these tests never contact Claude or Codex.

let output: CapturedOutput;

beforeEach(() => {
	vi.restoreAllMocks();
	claudeSdk.reset();
	codexSdk.reset();
	output = captureOutput();
});

/** The one JSON line a run printed on stdout. */
function result(): unknown {
	const lines = output
		.stdout()
		.split('\n')
		.filter(line => line !== '');
	expect(lines).toHaveLength(1);
	return JSON.parse(lines[0] ?? '') as unknown;
}

describe('single-turn run through the harness', () => {
	it('prints the Claude answer as one JSON line on stdout and exits with 0', async () => {
		claudeSdk.respond('APPROVE');

		await expect(dispatch(['single-turn', '--agent', 'claude', 'review this diff'])).resolves.toBe(
			0,
		);

		expect(result()).toEqual({
			response: 'APPROVE',
			inputTokens: 120,
			outputTokens: 30,
			duration: 1.5,
		});
		expect(claudeSdk.calls.map(call => call.prompt)).toEqual(['review this diff']);
	});

	it('prints the Codex answer as one JSON line on stdout and exits with 0', async () => {
		codexSdk.respond('REQUEST_CHANGES');

		await expect(dispatch(['single-turn', '--agent', 'codex', 'review this diff'])).resolves.toBe(
			0,
		);

		expect(result()).toMatchObject({
			response: 'REQUEST_CHANGES',
			inputTokens: 200,
			outputTokens: 40,
		});
		expect(codexSdk.prompts).toEqual(['review this diff']);
	});

	it('writes progress to stderr only', async () => {
		claudeSdk.respond('APPROVE', { reasoning: 'checking the retry policy' });

		await dispatch(['single-turn', '--agent', 'claude', 'review this diff']);

		expect(output.stderr()).toContain('checking the retry policy');
		expect(output.stdout()).not.toContain('checking the retry policy');
		expect(result()).toMatchObject({ response: 'APPROVE' });
	});

	it('keeps the harness retry warnings on stderr', async () => {
		claudeSdk.fail();
		claudeSdk.respond('APPROVE');

		await expect(dispatch(['single-turn', '--agent', 'claude', 'review this diff'])).resolves.toBe(
			0,
		);

		expect(claudeSdk.calls).toHaveLength(2);
		expect(output.stderr()).toContain('Attempt 1/3 failed; retrying');
		expect(result()).toMatchObject({ response: 'APPROVE' });
	});
});

describe('single-turn options reach the provider', () => {
	it('passes the model, reasoning effort, and permission bypass to Claude', async () => {
		claudeSdk.respond('APPROVE');

		await dispatch([
			'single-turn',
			'--agent',
			'claude',
			'--model',
			'sonnet',
			'--reasoning-effort',
			'low',
			'--auto-approve',
			'review this diff',
		]);

		expect(claudeSdk.calls[0]?.options).toMatchObject({
			model: 'sonnet',
			effort: 'low',
			permissionMode: 'bypassPermissions',
		});
	});

	it('keeps the provider defaults and its permission prompts without options', async () => {
		claudeSdk.respond('APPROVE');

		await dispatch(['single-turn', '--agent', 'claude', 'review this diff']);

		expect(claudeSdk.calls[0]?.options).toMatchObject({ model: 'opus', effort: 'high' });
		expect(claudeSdk.calls[0]?.options).not.toHaveProperty('permissionMode');
	});

	it('passes the model, reasoning effort, and permission bypass to Codex', async () => {
		codexSdk.respond('APPROVE');

		await dispatch([
			'single-turn',
			'--agent',
			'codex',
			'--model',
			'gpt-5.6-luna',
			'--reasoning-effort',
			'xhigh',
			'--auto-approve',
			'review this diff',
		]);

		expect(codexSdk.threads).toEqual([
			{
				model: 'gpt-5.6-luna',
				modelReasoningEffort: 'xhigh',
				approvalPolicy: 'never',
				sandboxMode: 'danger-full-access',
			},
		]);
	});
});

describe('single-turn failures', () => {
	it.each([
		[
			'a model of another provider',
			['--agent', 'claude', '--model', 'gpt-5.6-sol'],
			'"gpt-5.6-sol" is not a Claude model',
		],
		[
			'a reasoning effort the model does not support',
			['--agent', 'codex', '--model', 'gpt-5.6-luna', '--reasoning-effort', 'ultra'],
			'"gpt-5.6-luna" does not support the "ultra" reasoning effort',
		],
	])(
		'rejects %s with exit code 2 before contacting the provider',
		async (_case, options, message) => {
			await expect(dispatch(['single-turn', ...options, 'review this diff'])).resolves.toBe(2);

			expect(output.stderr()).toContain(message);
			expect(output.stderr()).toContain('Usage:');
			expect(output.stdout()).toBe('');
			expect(claudeSdk.calls).toHaveLength(0);
			expect(codexSdk.threads).toHaveLength(0);
		},
	);

	it('exits with 1 and prints no result when the provider fails the turn', async () => {
		codexSdk.failTurn('the model is overloaded');

		await expect(dispatch(['single-turn', '--agent', 'codex', 'review this diff'])).resolves.toBe(
			1,
		);

		expect(output.stdout()).toBe('');
		expect(output.stderr()).toContain('Turn failed from codex sdk');
	});
});

describe('single-turn cancellation', () => {
	it.each([
		['claude', 'SIGINT'],
		['claude', 'SIGTERM'],
		['codex', 'SIGINT'],
		['codex', 'SIGTERM'],
	] as const)('cancels a %s run on %s and exits with 1', async (agent, signal) => {
		if (agent === 'claude') {
			claudeSdk.runUntilClosed();
		} else {
			codexSdk.runUntilAborted();
		}
		const listenersBefore = new Set(process.listeners(signal));

		const run = dispatch(['single-turn', '--agent', agent, 'review this diff']);
		await vi.waitFor(() => {
			expect(output.stderr()).toContain('reading the repository');
		});
		// Calling the new listener directly avoids signalling the test runner itself.
		for (const listener of process.listeners(signal)) {
			if (!listenersBefore.has(listener)) listener(signal);
		}

		await expect(run).resolves.toBe(1);
		expect(output.stdout()).toBe('');
		expect(output.stderr()).toBe('reading the repository\nCancelled.\n');
	});
});

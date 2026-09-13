import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatch } from '../../src/dispatch.js';
import { claudeSdk } from '../support/fakes/claudeAgentSdk.fake.js';
import { codexSdk } from '../support/fakes/codexSdk.fake.js';
import { createInterface, useTerminal, type FakeTerminal } from '../support/fakes/readline.fake.js';
import { captureOutput, type CapturedOutput } from '../support/fixtures/output.fixture.js';

// Everything from the command line to the provider engines is real. vitest.config.ts aliases the
// provider SDKs to fakes, and this file replaces readline, the terminal the user types into.
vi.mock('node:readline/promises', async () => {
	const terminalFake = await import('../support/fakes/readline.fake.js');
	return { createInterface: terminalFake.createInterface };
});

let output: CapturedOutput;
let terminal: FakeTerminal;

beforeEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
	claudeSdk.reset();
	codexSdk.reset();
	terminal = useTerminal();
	output = captureOutput();
});

/** Leaves the session as a user does: Ctrl+C twice at an idle prompt. */
async function exitAtPrompt(count: number): Promise<void> {
	await terminal.waitForPrompt(count);
	terminal.pressCtrlC();
	terminal.pressCtrlC();
}

/** The default workflow: Codex plans and executes, and Claude approves. */
function scriptApprovedWorkflow(): void {
	codexSdk.respond('1. Cap the retries at three attempts.');
	codexSdk.respond('Capped the retries at three attempts.');
	claudeSdk.respond('{"decision":"approved"}');
}

describe('interactive session through the harness', () => {
	it('sends each prompt to the agent named by --agent and reports its usage', async () => {
		terminal.type('explain the retry policy');
		claudeSdk.respond('Recoverable failures are retried up to three times.');

		const session = dispatch(['--agent', 'claude', '--model', 'sonnet']);
		await exitAtPrompt(2);

		await expect(session).resolves.toBe(0);
		expect(claudeSdk.calls).toHaveLength(1);
		expect(claudeSdk.calls[0]).toMatchObject({
			prompt: 'explain the retry policy',
			options: { model: 'sonnet' },
		});
		expect(codexSdk.threads).toHaveLength(0);
		expect(output.stdout()).toContain('Recoverable failures are retried up to three times.');
		expect(output.stdout()).toContain('inputTokens: 120');
		expect(output.stdout()).toContain('thanks, bye!');
		expect(terminal.closed).toBe(true);
	});

	it('runs the plan → execute → review workflow without --agent', async () => {
		terminal.type('cap the retries');
		scriptApprovedWorkflow();

		const session = dispatch([]);
		await exitAtPrompt(2);

		await expect(session).resolves.toBe(0);
		expect(codexSdk.threads.map(thread => thread.model)).toEqual(['gpt-5.6-sol', 'gpt-5.6-luna']);
		expect(codexSdk.prompts[0]).toContain('cap the retries');
		expect(claudeSdk.calls[0]?.options).toMatchObject({ model: 'opus' });
		expect(output.stdout()).toContain('inputTokens: 520');
		expect(output.stdout()).toContain('outputTokens: 110');
	});

	it('passes --auto-approve to every workflow role', async () => {
		terminal.type('cap the retries');
		scriptApprovedWorkflow();

		const session = dispatch(['--auto-approve']);
		await exitAtPrompt(2);

		await expect(session).resolves.toBe(0);
		expect(codexSdk.threads).toHaveLength(2);
		for (const thread of codexSdk.threads) {
			expect(thread).toMatchObject({ approvalPolicy: 'never', sandboxMode: 'danger-full-access' });
		}
		expect(claudeSdk.calls[0]?.options).toMatchObject({ permissionMode: 'bypassPermissions' });
	});
});

describe('interactive session command line', () => {
	it.each([
		[
			'a model the agent does not support',
			['--agent', 'claude', '--model', 'gpt-5.6-sol'],
			'"gpt-5.6-sol" is not a Claude model',
		],
		[
			'a model without --agent',
			['--model', 'sonnet'],
			'--model and --reasoning-effort require --agent',
		],
	])('rejects %s with exit code 2 before opening the terminal', async (_case, args, message) => {
		await expect(dispatch(args)).resolves.toBe(2);

		expect(output.stderr()).toContain(message);
		expect(output.stderr()).toContain('Usage:');
		expect(createInterface).not.toHaveBeenCalled();
	});
});

describe('interactive session Ctrl+C', () => {
	it.each(['claude', 'codex'] as const)(
		'cancels a running %s turn and returns to the prompt',
		async agent => {
			terminal.type('refactor the loop');
			if (agent === 'claude') {
				claudeSdk.runUntilClosed();
			} else {
				codexSdk.runUntilAborted();
			}

			const session = dispatch(['--agent', agent]);
			await vi.waitFor(() => {
				expect(output.stdout()).toContain('reading the repository');
			});
			terminal.pressCtrlC();
			await exitAtPrompt(2);

			await expect(session).resolves.toBe(0);
			expect(output.stdout()).not.toContain('usage:');
			expect(output.stderr()).toBe('');
		},
	);

	it('cancels the workflow while it plans and returns to the prompt', async () => {
		terminal.type('cap the retries');
		codexSdk.runUntilAborted();

		const session = dispatch([]);
		await vi.waitFor(() => {
			expect(output.stdout()).toContain('reading the repository');
		});
		terminal.pressCtrlC();
		await exitAtPrompt(2);

		await expect(session).resolves.toBe(0);
		expect(codexSdk.prompts).toHaveLength(1);
		expect(claudeSdk.calls).toHaveLength(0);
		expect(output.stderr()).toBe('');
	});
});

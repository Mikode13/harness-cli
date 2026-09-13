import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type * as Harness from '@mikode13/harness';
import type { Agent, ProgressEvent } from '@mikode13/harness';
import { createAgent, createOrchestrator } from '@mikode13/harness';
import { PromptEmitter } from '../../src/adapters/promptEmitter.js';
import { ConversationLoop } from '../../src/conversationLoop.js';
import { CliUsageError } from '../../src/errors.js';
import { Repl } from '../../src/repl.js';

const loop = vi.hoisted(() => ({
	start: vi.fn(() => Promise.resolve()),
	cancel: vi.fn(),
	close: vi.fn(),
}));

// The factories would build provider clients, readline would take over the test runner's stdin,
// and the loop has its own tests, so these tests check only how the session wires them together.
vi.mock('@mikode13/harness', async importOriginal => ({
	...(await importOriginal<typeof Harness>()),
	createAgent: vi.fn(),
	createOrchestrator: vi.fn(),
}));
vi.mock('../../src/adapters/promptEmitter.js', () => ({ PromptEmitter: vi.fn() }));
vi.mock('../../src/conversationLoop.js', () => ({
	ConversationLoop: vi.fn(function () {
		return loop;
	}),
}));
vi.mock('../../src/spinner.js', () => ({
	Spinner: vi.fn(function () {
		return { startSpinner: vi.fn(), stopSpinner: vi.fn() };
	}),
}));

const agent: Agent = { run: vi.fn() };
const orchestrator: Agent = { run: vi.fn() };

let stdout: MockInstance<typeof console.log>;

function stdoutText(): string {
	return stdout.mock.calls.map(call => String(call[0])).join('\n');
}

function pressCtrlC(): void {
	const onCancel = vi.mocked(PromptEmitter).mock.calls[0]?.[0];
	if (!onCancel) throw new Error('The session did not register a Ctrl+C listener');
	onCancel();
}

function report(event: ProgressEvent): void {
	const callback = vi.mocked(ConversationLoop).mock.calls[0]?.[1];
	if (!callback) throw new Error('The session did not create its conversation loop');
	callback(event);
}

function pressCtrlCAt(now: number): void {
	vi.spyOn(Date, 'now').mockReturnValue(now);
	pressCtrlC();
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
	vi.mocked(createAgent).mockReturnValue(agent);
	vi.mocked(createOrchestrator).mockReturnValue(orchestrator);
	stdout = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('interactive session agent', () => {
	it('runs the orchestrator when no agent is given', () => {
		new Repl([]);

		expect(createOrchestrator).toHaveBeenCalledWith({ autoApprove: false });
		expect(createAgent).not.toHaveBeenCalled();
		expect(vi.mocked(ConversationLoop).mock.calls[0]?.[0]).toBe(orchestrator);
	});

	it('passes --auto-approve to the orchestrator', () => {
		new Repl(['--auto-approve']);

		expect(createOrchestrator).toHaveBeenCalledWith({ autoApprove: true });
	});

	it('talks to the selected agent directly when --agent is given', () => {
		new Repl([
			'--agent',
			'claude',
			'--model',
			'sonnet',
			'--reasoning-effort',
			'low',
			'--auto-approve',
		]);

		expect(createAgent).toHaveBeenCalledWith('claude', {
			model: 'sonnet',
			reasoningEffort: 'low',
			autoApprove: true,
		});
		expect(createOrchestrator).not.toHaveBeenCalled();
		expect(vi.mocked(ConversationLoop).mock.calls[0]?.[0]).toBe(agent);
	});

	it.each([
		['a model without an agent', ['--model', 'sonnet']],
		['a reasoning effort without an agent', ['--reasoning-effort', 'low']],
		['an unknown agent', ['--agent', 'gemini']],
		['a prompt, which only single-turn takes', ['review this diff']],
	])('rejects %s before readline takes over stdin', (_case, args) => {
		expect(() => new Repl(args)).toThrow(CliUsageError);
		// An open readline interface would keep the process alive instead of exiting with 2.
		expect(PromptEmitter).not.toHaveBeenCalled();
	});
});

describe('interactive session Ctrl+C', () => {
	it('cancels the running turn', () => {
		new Repl([]);
		report({ type: 'turnStarted' });

		pressCtrlC();

		expect(loop.cancel).toHaveBeenCalledOnce();
		expect(stdout).not.toHaveBeenCalled();
	});

	it('asks for confirmation instead of exiting on the first press while idle', () => {
		new Repl([]);

		pressCtrlCAt(0);

		expect(loop.cancel).not.toHaveBeenCalled();
		expect(stdoutText()).toBe('Press Ctrl+C again to exit.');
	});

	it('exits on a second press within three seconds', () => {
		new Repl([]);

		pressCtrlCAt(0);
		pressCtrlCAt(2999);

		expect(loop.cancel).toHaveBeenCalledOnce();
	});

	it('asks again when the second press comes after three seconds', () => {
		new Repl([]);

		pressCtrlCAt(0);
		pressCtrlCAt(3000);

		expect(loop.cancel).not.toHaveBeenCalled();
		expect(stdout).toHaveBeenCalledTimes(2);
	});

	it('treats a press as idle again once the turn ends', () => {
		new Repl([]);
		report({ type: 'turnStarted' });
		report({ type: 'turnEnded' });

		pressCtrlCAt(0);

		expect(loop.cancel).not.toHaveBeenCalled();
		expect(stdoutText()).toBe('Press Ctrl+C again to exit.');
	});
});

describe('interactive session lifecycle', () => {
	it('prints progress events', () => {
		new Repl([]);
		report({ type: 'turnStarted' });

		report({ type: 'reasoning', message: 'inspecting the diff' });

		expect(stdoutText()).toContain('inspecting the diff');
	});

	it('closes the loop once it ends', async () => {
		await new Repl([]).start();

		expect(loop.start).toHaveBeenCalledOnce();
		expect(loop.close).toHaveBeenCalledAfter(loop.start);
	});
});

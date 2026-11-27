import { testModelRun } from './modelSmoke.ts';
import assert from 'node:assert/strict';
import { testRender } from '@opentui/solid';
import { App } from './App.tsx';
import type { AgentResponse } from '@mikode13/harness';
import type { RunPrompt } from './localRunner.ts';

const pending = Promise.withResolvers<AgentResponse>();
let signal: AbortSignal | undefined;
const firstRunner: RunPrompt = (_prompt, { signal: abort, onRecord }) => {
	signal = abort;
	void onRecord?.({
		version: 1,
		type: 'progress',
		event: { type: 'reasoning', message: 'Inspecting the checkout' },
	});
	return pending.promise;
};
firstRunner.supportsInbox = true;
const ui = await testRender(
	() => (
		<App
			firstRunner={firstRunner}
			makeRunner={() => async (_prompt, options) => {
				assert.ok(options.ask && options.approve);
				const [answers, decision] = await Promise.all([
					options.ask(
						[
							{
								question: 'Choose a branch',
								options: [
									{ label: 'main', description: 'Default branch' },
									{ label: 'dev', description: 'Development branch' },
								],
								multiSelect: false,
							},
						],
						options.signal,
					),
					options.approve(
						{ tool: 'runCommand', risk: 'destructive', input: { command: 'build' } },
						options.signal,
					),
				]);
				assert.deepEqual(answers, ['dev']);
				assert.equal(decision.approved, false);
				return { response: 'Second reply', duration: 0 };
			}}
			exit={() => {
				throw new Error('Unexpected exit');
			}}
		/>
	),
	{ width: 100, height: 26, exitOnCtrlC: false },
);
try {
	const frame = (text: string) => ui.waitForFrame(view => view.includes(text));
	await frame('Uróboros');
	await ui.mockInput.typeText('First question');
	ui.mockInput.pressEnter();
	await frame('Inspecting the checkout');
	ui.mockInput.pressKey('F5');
	await frame('Workspace busy');
	ui.mockInput.pressEnter();
	ui.mockInput.pressKey('F5');
	await ui.waitForFrame(view => !view.includes('Esc close'));
	await ui.mockInput.typeText('Unread follow-up');
	ui.mockInput.pressKey('F6');
	await frame('During run');
	ui.mockInput.pressKey('n', { ctrl: true });
	await frame('Chat 2');
	await ui.mockInput.typeText('Second question');
	ui.mockInput.pressEnter();
	assert.equal(ui.captureCharFrame().includes('Second reply'), false);
	ui.mockInput.pressKey('F2');
	await frame('Inspecting the checkout');
	ui.mockInput.pressCtrlC();
	await frame('Cancelling');
	assert.ok(signal?.aborted);
	pending.resolve({ response: 'Discarded result', duration: 0 });
	await frame('Run cancelled.');
	ui.mockInput.pressKey('F2');
	await frame('Second question');
	ui.mockInput.pressEnter();
	await frame('Choose a branch');
	ui.mockInput.pressKey('F2');
	await frame('Run cancelled.');
	ui.mockInput.pressKey('F2');
	await frame('Choose a branch');
	await ui.mockInput.typeText('dev');
	ui.mockInput.pressEnter();
	await frame('Allow runCommand?');
	await ui.mockInput.typeText('Deny');
	ui.mockInput.pressEnter();
	await frame('Second reply');
	ui.mockInput.pressKey('F3');
	await ui.flush();
	assert.equal(ui.captureCharFrame().includes('Discarded result'), false);
} finally {
	await ui.dispose();
}
process.stdout.write('Terminal navigation and cancellation passed.\n');
await testModelRun();
process.stdout.write('Model API questions, approvals, run record and workspace recovery passed.\n');

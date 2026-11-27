import assert from 'node:assert/strict';
import { testRender } from '@opentui/solid';
import { App } from './App.tsx';
import type { RunPrompt } from './localRunner.ts';

const pending = Promise.withResolvers<string>();
let signal: AbortSignal | undefined;
const firstRunner: RunPrompt = (_prompt, abort, progress) => {
	signal = abort;
	progress('Inspecting the checkout');
	return pending.promise;
};
const ui = await testRender(
	() => (
		<App
			firstRunner={firstRunner}
			makeRunner={() => () => Promise.resolve('Second reply')}
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
	pending.resolve('Discarded result');
	await frame('Run cancelled.');
	ui.mockInput.pressKey('F2');
	await frame('Second question');
	ui.mockInput.pressEnter();
	await frame('Second reply');
	ui.mockInput.pressKey('F3');
	await ui.flush();
	assert.equal(ui.captureCharFrame().includes('Discarded result'), false);
} finally {
	await ui.dispose();
}
process.stdout.write('Terminal navigation and cancellation passed.\n');

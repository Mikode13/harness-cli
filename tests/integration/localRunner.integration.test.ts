import { expect, it } from 'vitest';
import { localRunner } from '../../tui/localRunner.ts';
import { codexSdk } from '../support/fakes/codexSdk.fake.ts';

it('forwards local progress and returns the final reply through the installed harness', async () => {
	codexSdk.reset();
	codexSdk.respond('Here are the changes.', { reasoning: 'Inspecting the diff' });
	const run = localRunner(['--agent', 'codex']);
	const updates: string[] = [];
	const reply = await run('Review this diff', new AbortController().signal, text => {
		updates.push(text);
	});
	expect(reply).toBe('Here are the changes.');
	expect(updates).toContain('Inspecting the diff');
	expect(codexSdk.prompts).toEqual(['Review this diff']);
});

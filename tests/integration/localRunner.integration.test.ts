import { expect, it } from 'vitest';
import { localRunner } from '../../tui/localRunner.ts';
import { codexSdk } from '../support/fakes/codexSdk.fake.ts';

it('forwards local progress and returns the final reply through the installed harness', async () => {
	codexSdk.reset();
	codexSdk.respond('Here are the changes.', { reasoning: 'Inspecting the diff' });
	const run = localRunner(['--agent', 'codex']);
	const updates: string[] = [];
	const reply = await run('Review this diff', {
		signal: new AbortController().signal,
		onRecord(entry) {
			if (entry.type === 'progress' && entry.event.type === 'reasoning')
				updates.push(entry.event.message);
		},
	});
	expect(reply.response).toBe('Here are the changes.');
	expect(updates).toContain('Inspecting the diff');
	expect(codexSdk.prompts).toEqual(['Review this diff']);
});

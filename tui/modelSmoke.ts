import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHistory, type RunEntry } from '@mikode13/harness';
import { previewMove } from './history.ts';
import { localRunner } from './localRunner.ts';

// Exercise the production factories, file tools, recovery store and provider adapter. Only
// the transport is scripted. Nothing reaches a provider or the caller's checkout.
export async function testModelRun() {
	const folder = await mkdtemp(join(tmpdir(), 'uroboros-tui-'));
	const root = join(folder, 'workspace');
	const previous = process.cwd();
	const fetch = globalThis.fetch;
	const state = process.env.XDG_STATE_HOME;
	const key = process.env.OPENAI_API_KEY;
	try {
		await mkdir(root);
		await writeFile(join(root, '.gitignore'), 'scratch-log.txt\n');
		process.chdir(root);
		process.env.XDG_STATE_HOME = join(folder, 'state');
		process.env.OPENAI_API_KEY = 'offline-test';
		const outputs = [
			{
				type: 'function_call',
				call_id: 'q',
				name: 'askUser',
				arguments: JSON.stringify({
					questions: [
						{
							question: 'Choose a file',
							options: [
								{ label: 'notes', description: 'Notes file' },
								{ label: 'readme', description: 'Readme file' },
							],
							multiSelect: false,
						},
					],
				}),
			},
			{
				type: 'apply_patch_call',
				call_id: 'edit',
				operation: { type: 'create_file', path: 'notes.md', diff: '+hello\n' },
			},
			{
				type: 'function_call',
				call_id: 'read',
				name: 'readFile',
				arguments: JSON.stringify({ path: '.gitignore', fromLine: null, lineCount: null }),
			},
			{
				type: 'apply_patch_call',
				call_id: 'remove',
				operation: { type: 'delete_file', path: '.gitignore' },
			},
			{ type: 'message', content: [{ type: 'output_text', text: 'Finished.' }] },
		];
		globalThis.fetch = () => {
			const output = outputs.shift();
			assert.ok(output, 'Unexpected provider request');
			return Promise.resolve(
				Response.json({
					status: 'completed',
					output: [output],
					usage: {
						input_tokens: 5,
						output_tokens: 2,
						input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
					},
				}),
			);
		};
		const run = localRunner(['--llm', '--agent', 'openai']);
		const entries: RunEntry[] = [];
		const result = await run('Make a note', {
			signal: AbortSignal.timeout(10000),
			onRecord(entry) {
				entries.push(entry);
			},
			ask: questions => questions.map(() => 'notes'),
			approve: () => ({ approved: false }),
		});
		assert.equal(result.response, 'Finished.');
		assert.ok(result.runId);
		assert.ok(result.session?.id);
		assert.ok(entries.some(e => e.type === 'answer'));
		assert.ok(entries.some(e => e.type === 'approvalDecision' && !e.decision.approved));
		assert.equal(entries.at(-1)?.type, 'end');
		assert.match(await readFile(join(root, 'notes.md'), 'utf8'), /hello/);
		const history = await createHistory({ root });
		const before = await previewMove(history, result.runId, true);
		assert.match(before.details, /hello/);
		assert.ok((await history.goTo(before.target, { from: before.from })).complete);
		await assert.rejects(readFile(join(root, 'notes.md')), { code: 'ENOENT' });
		await assert.rejects(history.goTo(before.target, { from: before.from }), {
			name: 'WorkspaceMovedError',
		});
		const after = await previewMove(history, result.runId, false);
		assert.ok((await history.goTo(after.target, { from: after.from })).complete);
		assert.match(await readFile(join(root, 'notes.md'), 'utf8'), /hello/);
	} finally {
		globalThis.fetch = fetch;
		process.chdir(previous);
		if (state === undefined) delete process.env.XDG_STATE_HOME;
		else process.env.XDG_STATE_HOME = state;
		if (key === undefined) delete process.env.OPENAI_API_KEY;
		else process.env.OPENAI_API_KEY = key;
		await rm(folder, { recursive: true, force: true });
	}
}

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { historyStart, type History, type HistoryRun } from '@mikode13/harness';

const git = promisify(execFile);

// Match the core's definition of published (the recorded branch's upstream). The core
// checks again under its workspace lock when applying the move.
async function canReset(runs: HistoryRun[]): Promise<boolean> {
	let hasCommits = false;
	for (const run of runs) {
		for (const group of run.commits ?? []) {
			if (!group.commits.length) continue;
			hasCommits = true;
			try {
				const { stdout } = await git(
					'git',
					['for-each-ref', '--format=%(refname) %(upstream)', 'refs/heads/' + group.branch],
					{ cwd: group.repository },
				);
				const line = stdout.split('\n').find(s => s.startsWith('refs/heads/' + group.branch + ' '));
				if (line === undefined) return false;
				const upstream = line.slice(('refs/heads/' + group.branch + ' ').length);
				if (!upstream) continue;
				for (const commit of group.commits) {
					try {
						await git('git', ['merge-base', '--is-ancestor', commit.sha, upstream], {
							cwd: group.repository,
						});
						return false;
					} catch (error) {
						if (!(error instanceof Error && 'code' in error && error.code === 1)) return false;
					}
				}
			} catch {
				return false;
			}
		}
	}
	return hasCommits;
}

export async function previewMove(history: History, runId: string, before: boolean) {
	const { runs, head } = await history.list();
	const byId = new Map(runs.map(r => [r.runId, r]));
	const selected = byId.get(runId);
	if (!selected)
		throw new Error('This run is no longer available as an individual history target.');
	const target = before ? (selected.parentRunId ?? historyStart) : runId;
	function path(id: string | undefined) {
		const result = [];
		while (id && id !== historyStart) {
			const run = byId.get(id);
			if (!run) throw new Error('History changed. Reopen the preview.');
			result.push(run);
			id = run.parentRunId;
		}
		return result;
	}
	const undo = path(head);
	const redo = path(target);
	while (undo.length && redo.length && undo.at(-1)?.runId === redo.at(-1)?.runId) {
		undo.pop();
		redo.pop();
	}
	redo.reverse();
	const sections = [];
	for (const [direction, steps] of [
		['Undo', undo],
		['Redo', redo],
	] as const) {
		for (const step of steps) {
			sections.push(
				[
					direction +
						' ' +
						step.runId +
						' · ' +
						(step.session?.name ?? step.session?.id ?? 'Unknown session'),
					...(step.commits ?? []).flatMap(group =>
						group.commits.map(c => group.branch + ' ' + c.sha + ' ' + c.subject),
					),
					await history.changes(step.runId),
				].join('\n'),
			);
		}
	}
	return {
		from: head ?? historyStart,
		target,
		details: sections.join('\n\n') || 'The workspace is already here.',
		hasCommits: undo.some(r => r.commits?.some(g => g.commits.length)),
		reset: await canReset(undo),
	};
}

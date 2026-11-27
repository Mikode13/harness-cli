import type { ProgressEvent, RunEntry } from '@mikode13/harness';

export function progressLine(event: ProgressEvent): string {
	switch (event.type) {
		case 'reasoning':
		case 'agentMessage':
			return event.message;
		case 'command':
			return event.command;
		case 'tool':
			return [event.name, event.status, event.summary, event.error].filter(Boolean).join(' · ');
		case 'search':
			return event.query;
		case 'fileChange':
			return event.changes.map(c => c.kind + ' ' + c.path).join('\n');
		case 'mcpTool':
			return [event.server, event.tool, event.status].join(' · ');
		case 'todoList':
			return event.items.map(i => (i.completed ? '✓ ' : '· ') + i.text).join('\n');
		case 'step':
			return 'Step ' + String(event.step);
		case 'compaction':
			return 'Context compacted · ' + event.by;
		case 'workflowStage':
			return event.stage + ' · attempt ' + String(event.attempt);
		case 'workflowTransition':
			return event.stage + ' → ' + (event.nextStage ?? event.transition);
		case 'turnStarted':
			return 'Started';
		case 'turnEnded':
			return 'Finished';
		case 'subagentEnded':
			return event.name + ' · ' + event.outcome;
		case 'subagent':
			return event.name + ' · ' + progressLine(event.event);
		default:
			return '';
	}
}

// The whole delegation path identifies a worker, even when concurrent calls reuse a tool name.
export function activityRow(event: ProgressEvent) {
	const path: (number | string)[] = [event.agent ?? 'Uróboros'];
	const labels: string[] = [event.agent ?? 'Uróboros'];
	let task = '';
	while (event.type === 'subagent') {
		path.push(event.callId, event.subagent);
		labels.push(event.name + ' ' + String(event.subagent));
		task = event.task;
		event = event.event;
	}
	if (event.type === 'subagentEnded') {
		path.push(event.callId, event.subagent);
		labels.push(event.name + ' ' + String(event.subagent));
	}
	return {
		key: JSON.stringify(path),
		ended: event.type === 'subagentEnded' || event.type === 'turnEnded',
		label: labels.join(' › '),
		task,
		diff: event.type === 'tool' ? event.diff : undefined,
		text: progressLine(event),
	};
}

export function recordLine(entry: RunEntry): string {
	if (entry.type === 'progress') {
		const row = activityRow(entry.event);
		return row.label + ' · ' + row.text + (row.diff ? '\n' + row.diff : '');
	}
	return JSON.stringify(entry, null, 2);
}

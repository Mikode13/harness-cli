import type { Approver, Asker } from '@mikode13/harness';

export interface Decision {
	prompt: string;
	choices: string[];
	details: string;
	freeText: boolean;
	answer: (text: string) => void;
}

// Several delegates can ask at once. Each request owns its abort listener and answer.
export function terminalDecisions(notify: (active: Decision | undefined) => void) {
	const queue: Decision[] = [];
	function request(view: Omit<Decision, 'answer'>, signal: AbortSignal) {
		signal.throwIfAborted();
		return new Promise<string>((resolve, reject) => {
			function remove() {
				signal.removeEventListener('abort', abort);
				const index = queue.indexOf(item);
				queue.splice(index, 1);
				if (index === 0) notify(queue[0]);
			}
			function abort() {
				remove();
				reject(signal.reason instanceof Error ? signal.reason : new Error('Run cancelled'));
			}
			const item: Decision = {
				...view,
				answer(text) {
					if (queue[0] !== item || !text.trim() || (!view.freeText && !view.choices.includes(text)))
						return;
					remove();
					resolve(text.trim());
				},
			};
			queue.push(item);
			signal.addEventListener('abort', abort, { once: true });
			if (queue.length === 1) notify(item);
		});
	}
	const ask: Asker = async (questions, signal) => {
		const answers = [];
		for (const q of questions) {
			answers.push(
				await request(
					{
						prompt: q.question,
						choices: q.options.map(o => o.label),
						details:
							q.options.map(o => o.label + ' — ' + o.description).join('\n') +
							(q.multiSelect ? '\nEnter multiple choices together, or your own answer.' : ''),
						freeText: true,
					},
					signal,
				),
			);
		}
		return answers;
	};
	const approve: Approver = async (req, signal) => ({
		approved:
			(await request(
				{
					prompt: 'Allow ' + req.tool + '?',
					choices: ['Deny', 'Approve'],
					details: JSON.stringify(req, null, 2),
					freeText: false,
				},
				signal,
			)) === 'Approve',
	});
	return { ask, approve };
}

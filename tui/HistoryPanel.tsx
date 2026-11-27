import { createResource, createSignal, Show } from 'solid-js';
import { useKeyboard } from '@opentui/solid';
import type { CommitsPolicy, History } from '@mikode13/harness';
import { previewMove } from './history.ts';

export function HistoryPanel(props: {
	runId: string | undefined;
	openHistory: () => Promise<History>;
	busy: boolean;
	onMoving: (value: boolean) => void;
	close: () => void;
}) {
	const [before, setBefore] = createSignal(true);
	const [policy, setPolicy] = createSignal<CommitsPolicy>('keep');
	const [result, setResult] = createSignal('');
	const [moving, setMoving] = createSignal(false);
	const [preview] = createResource(
		() => ({ id: props.runId, before: before() }),
		async ({ id, before }) => {
			if (!id) return undefined;
			try {
				const history = await props.openHistory();
				return { history, move: await previewMove(history, id, before) };
			} catch (error) {
				return { error: String(error) };
			}
		},
	);
	const move = () => preview()?.move;
	function destination(value: boolean) {
		if (moving() || result()) return;
		setPolicy('keep');
		setBefore(value);
	}
	async function apply() {
		const snapshot = preview();
		const plan = snapshot?.move;
		if (!plan || preview.loading || moving() || props.busy || result() || plan.from === plan.target)
			return;
		setMoving(true);
		props.onMoving(true);
		try {
			const changed = await snapshot.history.goTo(plan.target, {
				from: plan.from,
				commits: plan.hasCommits && (policy() !== 'reset' || plan.reset) ? policy() : 'keep',
				reason: 'Restored from the Uróboros prompt index',
			});
			setResult(
				[
					changed.complete ? 'Workspace restored.' : 'Partially restored.',
					...changed.conflicts.map(c => 'File left unchanged: ' + c.path),
					...(changed.git ?? []).map(
						g => g.branch + ' · ' + g.action + ' · ' + g.outcome + ' ' + (g.reason ?? ''),
					),
					'Messages remain in this chat. The next model API run sees the history move.',
				].join('\n'),
			);
		} catch (error) {
			setResult(String(error));
		} finally {
			setMoving(false);
			props.onMoving(false);
		}
	}
	useKeyboard(key => {
		if (key.name === 'escape' || key.name === 'f5') {
			if (!moving()) props.close();
		} else if (key.name === 'b') destination(true);
		else if (key.name === 'a') destination(false);
		else if (key.name === 'k') setPolicy('keep');
		else if (key.name === 'v' && move()?.hasCommits) setPolicy('revert');
		else if (key.name === 'r' && move()?.reset) setPolicy('reset');
		else if (key.name === 'return') void apply();
		else return;
		key.preventDefault();
	});
	return (
		<box
			border
			title="Restore workspace · Esc close"
			height="55%"
			minHeight={7}
			flexDirection="column"
		>
			<text>B before prompt · A after prompt · {before() ? 'Before' : 'After'} selected</text>
			<scrollbox flexGrow={1} minHeight={0} focused>
				<text>
					{result() ||
						(!props.runId
							? 'This prompt has no linked workspace history target.'
							: preview.loading
								? 'Loading diff…'
								: (preview()?.error ?? move()?.details))}
				</text>
			</scrollbox>
			<Show when={move()?.hasCommits && !result()}>
				<text>
					K keep · V revert {move()?.reset ? '· R reset unpublished' : ''} · {policy()}
				</text>
			</Show>
			<text
				onMouseDown={() => {
					void apply();
				}}
			>
				{moving()
					? 'Restoring…'
					: props.busy
						? 'Workspace busy · restore disabled'
						: result()
							? 'Esc close'
							: move() && move()?.from !== move()?.target && !preview.loading
								? 'Enter · confirm restore'
								: ''}
			</text>
		</box>
	);
}

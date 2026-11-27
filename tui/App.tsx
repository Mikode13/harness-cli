import { HistoryPanel } from './HistoryPanel.tsx';
import { createHistory, Inbox } from '@mikode13/harness';
import type { ScrollBoxRenderable } from '@opentui/core';
import { useKeyboard } from '@opentui/solid';
import { For, Index, Show, createSignal, onCleanup } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import type { RunPrompt } from './localRunner.ts';

import { activityRow, recordLine } from './runRecord.ts';
import { terminalDecisions, type Decision } from './decisions.ts';
import type { RunEntry } from '@mikode13/harness';

type Status =
	'Waiting for input' | 'Ready' | 'Running' | 'Cancelling' | 'Cancelled' | 'Finished' | 'Failed';
interface Turn {
	prompt: string;
	reply: string;
	entries: RunEntry[];
	followUps: string[];
	runId?: string;
}
interface Chat {
	title: string;
	draft: string;
	status: Status;
	turns: Turn[];
	activity: Record<string, ReturnType<typeof activityRow>>;
}
function newChat(number: number): Chat {
	return { title: 'Chat ' + String(number), draft: '', status: 'Ready', turns: [], activity: {} };
}
const accent = '#83d9b8';
const muted = '#9daabb';

export function App(props: {
	firstRunner: RunPrompt;
	makeRunner: () => RunPrompt;
	exit: () => void;
}) {
	const runners = [props.firstRunner];
	const [chats, setChats] = createStore<Chat[]>([newChat(1)]);
	const [selected, select] = createSignal(0);
	const chat = () => {
		const current = chats[selected()];
		if (!current) throw new Error('No chat selected');
		return current;
	};
	const [busy, setBusy] = createSignal<number>();
	const [historyOpen, setHistoryOpen] = createSignal(false);
	const [moving, setMoving] = createSignal(false);
	let inbox: Inbox | undefined;
	let controller: AbortController | undefined;
	let transcript: ScrollBoxRenderable | undefined;
	const [promptIndex, setPromptIndex] = createSignal(-1);
	const [inspecting, inspect] = createSignal(false);
	const [decision, setDecision] = createSignal<Decision>();
	const [answer, setAnswer] = createSignal('');
	const activeDecision = () => (busy() === selected() ? decision() : undefined);
	function showDecision(next: Decision | undefined) {
		if (disposed) return;
		setDecision(next);
		setAnswer('');
		const owner = busy();
		if (owner !== undefined && !controller?.signal.aborted)
			setChats(owner, 'status', next ? 'Waiting for input' : 'Running');
	}
	let disposed = false;
	onCleanup(() => {
		disposed = true;
		controller?.abort();
	});

	function switchTo(index: number) {
		if (historyOpen()) return;
		if (historyOpen()) return;
		select(index);
		setPromptIndex(-1);
		inspect(false);
	}
	function addChat() {
		const next = chats.length;
		runners.push(props.makeRunner());
		setChats(next, newChat(next + 1));
		switchTo(next);
	}
	function jump(index: number) {
		if (historyOpen()) return;
		if (historyOpen()) return;
		setPromptIndex(index);
		transcript?.scrollChildIntoView('turn-' + String(index), { align: 'start' });
	}
	function cancel() {
		const owner = busy();
		if (owner === undefined) {
			props.exit();
			return;
		}
		switchTo(owner);
		setChats(owner, 'status', 'Cancelling');
		controller?.abort();
	}
	useKeyboard(key => {
		if (historyOpen()) return;
		if (
			key.name === 'f6' &&
			inbox &&
			selected() === busy() &&
			!decision() &&
			!controller?.signal.aborted
		) {
			const text = chat().draft.trim();
			if (text && inbox.send(text)) {
				const index = chat().turns.length - 1;
				setChats(selected(), 'turns', index, 'followUps', messages => [...messages, text]);
				setChats(selected(), 'draft', '');
			}
		} else if (key.name === 'f5' && chat().turns.length) {
			if (promptIndex() < 0) jump(chat().turns.length - 1);
			inspect(false);
			setHistoryOpen(true);
		} else if (key.ctrl && key.name === 'c') cancel();
		else if (key.ctrl && key.name === 'n') addChat();
		else if (key.name === 'f4' && chat().turns.length) {
			if (promptIndex() < 0) jump(chat().turns.length - 1);
			inspect(!inspecting());
		} else if (key.name === 'escape' && inspecting()) inspect(false);
		else if (key.name === 'f2') switchTo((selected() + 1) % chats.length);
		else if (key.name === 'f3' && chat().turns.length)
			jump((promptIndex() + 1) % chat().turns.length);
		else return;
		key.preventDefault();
	});

	async function submit(value: string) {
		const owner = selected();
		const run = runners[owner];
		const prompt = value.trim();
		const pending = activeDecision();
		if (pending) {
			pending.answer(prompt);
			return;
		}
		if (!run || !prompt || historyOpen() || moving() || busy() !== undefined) return;
		const turn = chat().turns.length;
		const abort = new AbortController();
		controller = abort;
		inbox = run.supportsInbox ? new Inbox() : undefined;
		setBusy(owner);
		if (!turn) setChats(owner, 'title', prompt);
		setChats(owner, 'draft', '');
		setChats(owner, 'turns', turn, { prompt, reply: '', entries: [], followUps: [] });
		setChats(owner, 'status', 'Running');
		setChats(owner, 'activity', reconcile({}));
		inspect(false);
		transcript?.scrollTo(Infinity);
		try {
			const { ask, approve } = terminalDecisions(showDecision);
			const result = await run(prompt, {
				signal: abort.signal,
				inbox,
				ask,
				approve,
				onRecord(entry) {
					if (disposed) return;
					setChats(
						owner,
						'turns',
						turn,
						'entries',
						chats[owner]?.turns[turn]?.entries.length ?? 0,
						entry,
					);
					if (entry.type === 'end' && entry.outcome === 'failed' && entry.failure.committed?.runId)
						setChats(owner, 'turns', turn, 'runId', entry.failure.committed.runId);
					if (entry.type === 'progress' && busy() === owner && controller === abort) {
						const row = activityRow(entry.event);
						if (row.ended) {
							const remaining = Object.fromEntries(
								Object.entries(chats[owner]?.activity ?? {}).filter(([key]) => key !== row.key),
							);
							setChats(owner, 'activity', reconcile(remaining));
						} else {
							setChats(owner, 'activity', row.key, row);
						}
					}
				},
			});
			abort.signal.throwIfAborted();
			if (!disposed) {
				if (result.runId) setChats(owner, 'turns', turn, 'runId', result.runId);
				setChats(owner, 'turns', turn, 'reply', result.response);
				setChats(owner, 'status', 'Finished');
			}
		} catch (error) {
			if (!disposed) {
				const message = abort.signal.aborted ? 'Run cancelled.' : String(error);
				setChats(owner, 'turns', turn, 'reply', message);
				setChats(owner, 'status', abort.signal.aborted ? 'Cancelled' : 'Failed');
			}
		} finally {
			const unread = inbox?.close() ?? [];
			if (!disposed && unread.length)
				setChats(owner, 'draft', draft => [...unread, draft].filter(Boolean).join(' '));
			inbox = undefined;
			controller = undefined;
			if (!disposed) setDecision(undefined);
			if (!disposed) setBusy(undefined);
		}
	}

	return (
		<box flexDirection="column" flexGrow={1}>
			<text fg={accent}>◉ Uróboros {runners[selected()]?.engine}</text>
			<box flexDirection="row" flexGrow={1} minHeight={0}>
				<box width="30%" minWidth={16} flexDirection="column">
					<scrollbox title="Chats" border flexGrow={1} flexBasis={0}>
						<For each={chats}>
							{(item, index) => (
								<box
									onMouseDown={() => {
										switchTo(index());
									}}
								>
									<text fg={selected() === index() ? accent : muted} wrapMode="none">
										{selected() === index() ? '▸ ' : '  '}
										{item.title}
									</text>
									<text fg={muted}> ● LOCAL · {item.status}</text>
								</box>
							)}
						</For>
					</scrollbox>
					<scrollbox title="Prompts" border flexGrow={1} flexBasis={0}>
						<Index each={chat().turns}>
							{(turn, index) => (
								<text
									wrapMode="none"
									onMouseDown={() => {
										jump(index);
									}}
								>
									{index + 1}. {turn().prompt}
								</text>
							)}
						</Index>
					</scrollbox>
				</box>
				<box flexDirection="column" flexGrow={1} minWidth={0}>
					<Show when={chat()} keyed>
						{(current: Chat) => (
							<scrollbox
								ref={box => {
									transcript = box;
								}}
								title="Conversation"
								border
								flexGrow={1}
								minHeight={0}
								stickyScroll
								stickyStart="bottom"
							>
								<Show when={!current.turns.length}>
									<text fg={muted}>Write a prompt to start this local chat.</text>
								</Show>
								<Index each={current.turns}>
									{(turn, index) => (
										<box id={'turn-' + String(index)} flexDirection="column" marginBottom={1}>
											<text fg={accent}>› {turn().prompt}</text>
											<For each={turn().followUps}>
												{message => <text fg={muted}>› During run · {message}</text>}
											</For>
											<text>{turn().reply}</text>
										</box>
									)}
								</Index>
							</scrollbox>
						)}
					</Show>
					<Show when={busy() === selected()}>
						<scrollbox title="Run activity" border height="25%" minHeight={3}>
							<For
								each={Object.values(chat().activity)}
								fallback={<text>Waiting for the agent…</text>}
							>
								{row => (
									<text>
										{row.label} · {row.task ? row.task + ' · ' : ''}
										{row.text}
									</text>
								)}
							</For>
						</scrollbox>
					</Show>
					<Show when={historyOpen()}>
						<HistoryPanel
							runId={chat().turns[promptIndex()]?.runId}
							openHistory={() => createHistory({ root: process.cwd() })}
							busy={busy() !== undefined}
							onMoving={setMoving}
							close={() => {
								setHistoryOpen(false);
							}}
						/>
					</Show>
					<Show when={inspecting()}>
						<scrollbox title="Run record · F4 close" border height="45%" minHeight={4}>
							<For each={chat().turns[promptIndex()]?.entries}>
								{entry => <text>{recordLine(entry)}</text>}
							</For>
						</scrollbox>
					</Show>
					<Show when={activeDecision()} keyed>
						{(pending: Decision) => (
							<scrollbox title="Response required" border height="32%" minHeight={5}>
								<text>{pending.prompt}</text>
								<text>{pending.details}</text>
								<For each={pending.choices}>
									{choice => (
										<text
											fg={accent}
											onMouseDown={() => {
												pending.answer(choice);
											}}
										>
											{'[' + choice + ']'}
										</text>
									)}
								</For>
							</scrollbox>
						)}
					</Show>
					<Show when={busy() !== undefined && !activeDecision()}>
						<text fg={muted}>
							Local workspace busy · Ctrl+C cancel{' '}
							{busy() === selected() && runners[selected()]?.supportsInbox
								? '· F6 send draft to active run'
								: ''}
						</text>
					</Show>
					<box border title="Prompt" height={3}>
						<input
							focused={!historyOpen()}
							value={activeDecision() ? answer() : chat().draft}
							onInput={v => {
								if (activeDecision()) setAnswer(v);
								else setChats(selected(), 'draft', v);
							}}
							onSubmit={v => {
								void submit(v);
							}}
							placeholder={
								activeDecision() ? 'Type an answer or click a choice…' : 'Type a message…'
							}
						/>
					</box>
				</box>
			</box>
			<text fg={muted}>
				Ctrl+N new chat · F2 next chat · F3 next prompt · F4 record · F5 restore · Ctrl+C
				cancel/exit
			</text>
		</box>
	);
}

import type { ScrollBoxRenderable } from '@opentui/core';
import { useKeyboard } from '@opentui/solid';
import { For, Index, Show, createSignal, onCleanup } from 'solid-js';
import { createStore } from 'solid-js/store';
import type { RunPrompt } from './localRunner.ts';

type Status = 'Ready' | 'Running' | 'Cancelling' | 'Cancelled' | 'Finished' | 'Failed';
interface Turn {
	prompt: string;
	reply: string;
}
interface Chat {
	title: string;
	draft: string;
	status: Status;
	turns: Turn[];
	activity: string;
}
function newChat(number: number): Chat {
	return { title: 'Chat ' + String(number), draft: '', status: 'Ready', turns: [], activity: '' };
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
	let controller: AbortController | undefined;
	let transcript: ScrollBoxRenderable | undefined;
	let promptIndex = -1;
	let disposed = false;
	onCleanup(() => {
		disposed = true;
		controller?.abort();
	});

	function switchTo(index: number) {
		select(index);
		promptIndex = -1;
	}
	function addChat() {
		const next = chats.length;
		runners.push(props.makeRunner());
		setChats(next, newChat(next + 1));
		switchTo(next);
	}
	function jump(index: number) {
		promptIndex = index;
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
		if (key.ctrl && key.name === 'c') cancel();
		else if (key.ctrl && key.name === 'n') addChat();
		else if (key.name === 'f2') switchTo((selected() + 1) % chats.length);
		else if (key.name === 'f3' && chat().turns.length)
			jump((promptIndex + 1) % chat().turns.length);
		else return;
		key.preventDefault();
	});

	async function submit(value: string) {
		const owner = selected();
		const run = runners[owner];
		const prompt = value.trim();
		if (!run || !prompt || busy() !== undefined) return;
		const turn = chat().turns.length;
		const abort = new AbortController();
		controller = abort;
		setBusy(owner);
		if (!turn) setChats(owner, 'title', prompt);
		setChats(owner, 'draft', '');
		setChats(owner, 'turns', turn, { prompt, reply: '' });
		setChats(owner, 'status', 'Running');
		setChats(owner, 'activity', 'Waiting for the agent…');
		transcript?.scrollTo(Infinity);
		try {
			const reply = await run(prompt, abort.signal, message => {
				if (!disposed && !abort.signal.aborted) setChats(owner, 'activity', message);
			});
			abort.signal.throwIfAborted();
			if (!disposed) {
				setChats(owner, 'turns', turn, 'reply', reply);
				setChats(owner, 'status', 'Finished');
			}
		} catch (error) {
			if (!disposed) {
				const message = abort.signal.aborted ? 'Run cancelled.' : String(error);
				setChats(owner, 'turns', turn, 'reply', message);
				setChats(owner, 'status', abort.signal.aborted ? 'Cancelled' : 'Failed');
			}
		} finally {
			controller = undefined;
			if (!disposed) setBusy(undefined);
		}
	}

	return (
		<box flexDirection="column" flexGrow={1}>
			<text fg={accent}>◉ Uróboros</text>
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
											<text>{turn().reply}</text>
										</box>
									)}
								</Index>
							</scrollbox>
						)}
					</Show>
					<Show when={busy() === selected()}>
						<scrollbox title="Run activity" border height="25%" minHeight={3}>
							<text>{chat().activity}</text>
						</scrollbox>
					</Show>
					<Show when={busy() !== undefined}>
						<text fg={muted}>Local workspace busy · Ctrl+C to cancel the active run</text>
					</Show>
					<box border title="Prompt" height={3}>
						<input
							focused
							value={chat().draft}
							onInput={v => {
								setChats(selected(), 'draft', v);
							}}
							onSubmit={v => {
								void submit(v);
							}}
							placeholder="Type a message…"
						/>
					</box>
				</box>
			</box>
			<text fg={muted}>Ctrl+N new chat · F2 next chat · F3 next prompt · Ctrl+C cancel/exit</text>
		</box>
	);
}

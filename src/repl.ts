import { createAgent, createOrchestrator } from '@mikode13/harness';
import type { Agent, ProgressEvent } from '@mikode13/harness';
import { Output } from './adapters/output.ts';
import { PromptEmitter } from './adapters/promptEmitter.ts';
import { ConversationLoop } from './conversationLoop.ts';
import type { IOutput } from './output.ts';
import { Spinner } from './spinner.ts';
import { formatProgressEvent } from './progressEventFormatter.ts';
import { parseHarnessArgs } from './agentOptions.ts';
import { CliUsageError } from './errors.ts';

const exitConfirmationWindowMs = 3000;

/** `--agent` talks to one agent directly; without it the session runs the orchestrator. */
function buildAgent(args: readonly string[]): Agent {
	const { provider, model, reasoningEffort, autoApprove } = parseHarnessArgs(args, {
		allowPositionals: false,
	}).options;

	if (!provider) {
		// The orchestrator picks its own models, so ignoring these would misreport what runs.
		if (model !== undefined || reasoningEffort !== undefined) {
			throw new CliUsageError('--model and --reasoning-effort require --agent');
		}
		return createOrchestrator({ autoApprove });
	}

	return createAgent(provider, { model, reasoningEffort, autoApprove });
}

export class Repl {
	private readonly loop: ConversationLoop;
	private readonly output: IOutput = new Output();
	private readonly spinner = new Spinner();
	private turnActive = false;
	private cancelRequestedAt: number | undefined;

	constructor(args: readonly string[]) {
		// A rejected command line must throw before readline takes over stdin and keeps the
		// process alive.
		const agent = buildAgent(args);
		const promptEmitter = new PromptEmitter(this.onCancel);
		this.loop = new ConversationLoop(agent, this.callback, promptEmitter, this.output);
	}

	private readonly onCancel = (): void => {
		if (this.turnActive) {
			this.loop.cancel();
			return;
		}

		const now = Date.now();
		if (
			this.cancelRequestedAt !== undefined &&
			now - this.cancelRequestedAt < exitConfirmationWindowMs
		) {
			this.cancelRequestedAt = undefined;
			this.loop.cancel();
			return;
		}

		this.cancelRequestedAt = now;
		this.output.print('Press Ctrl+C again to exit.');
	};

	private readonly callback = (item: ProgressEvent): void => {
		if (item.type === 'turnStarted') {
			this.turnActive = true;
			this.spinner.startSpinner();
			return;
		}
		if (item.type === 'turnEnded') {
			this.turnActive = false;
			this.spinner.stopSpinner();
			return;
		}

		this.spinner.stopSpinner();
		const message = formatProgressEvent(item);
		if (message) {
			this.output.print(message);
		}
		this.spinner.startSpinner();
	};

	async start(): Promise<void> {
		await this.loop.start();
		this.loop.close();
	}
}

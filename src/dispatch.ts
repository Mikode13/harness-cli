import { InvalidAgentConfigError, agentProviders, isAbortError } from '@mikode13/harness';
import { CliUsageError } from './errors.ts';
import { Repl } from './repl.ts';
import { start as startSingleTurn } from './singleTurn.ts';

const usage = `Usage:
  harness-cli [options]                                         Start the interactive session.
  harness-cli single-turn --agent <agent> [options] "<prompt>"  Run one turn and print a JSON result to stdout.

Options:
  --agent             ${agentProviders.join(', ')}. Required by single-turn. Without it, the interactive
                      session runs the plan → execute → review workflow.
  --model             A model the agent supports. Requires --agent. Defaults to the agent's default model.
  --reasoning-effort  Requires --agent. Defaults to high.
  --auto-approve      Bypass provider permission prompts. Only with a trusted workspace and prompt.`;

function rejectCommandLine(message: string): number {
	console.error(`${message}\n\n${usage}`);
	return 2;
}

/** Runs the command in `args` and returns the exit code for the process. */
export async function dispatch(args: readonly string[]): Promise<number> {
	const [command, ...commandArgs] = args;

	// Options without a command configure the interactive session.
	if (command !== undefined && !command.startsWith('-') && command !== 'single-turn') {
		return rejectCommandLine(`Unknown command "${command}".`);
	}

	try {
		if (command === 'single-turn') {
			await startSingleTurn(commandArgs);
		} else {
			await new Repl(args).start();
		}
		return 0;
	} catch (error) {
		if (error instanceof CliUsageError || error instanceof InvalidAgentConfigError) {
			return rejectCommandLine(error.message);
		}

		if (isAbortError(error)) {
			console.error('Cancelled.');
			return 1;
		}

		console.error(error);
		return 1;
	}
}

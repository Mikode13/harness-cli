import { createCliRenderer } from '@opentui/core';
import { render } from '@opentui/solid';
import { App } from './App.tsx';
import { localRunner } from './localRunner.ts';

const args = process.argv.slice(2);
const makeRunner = () => localRunner(args);
try {
	const firstRunner = makeRunner();
	const renderer = await createCliRenderer({ exitOnCtrlC: false });
	await render(
		() => (
			<App
				firstRunner={firstRunner}
				makeRunner={makeRunner}
				exit={() => {
					renderer.destroy();
				}}
			/>
		),
		renderer,
	);
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}

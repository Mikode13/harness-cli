import { clearLine, cursorTo } from 'node:readline';

export class Spinner {
	private spinnerFrames: string[];
	private spinnerFrame: number;
	private spinnerInterval: NodeJS.Timeout | undefined;

	constructor(spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']) {
		this.spinnerFrames = spinnerFrames;
		this.spinnerFrame = 0;
	}

	startSpinner(): void {
		this.spinnerInterval ??= setInterval(() => {
			cursorTo(process.stdout, 0);
			process.stdout.write(this.spinnerFrames[this.spinnerFrame % this.spinnerFrames.length] ?? '');
			this.spinnerFrame++;
		}, 80);
	}

	stopSpinner(): void {
		clearInterval(this.spinnerInterval);
		this.spinnerInterval = undefined;
		cursorTo(process.stdout, 0);
		clearLine(process.stdout, 0);
	}
}

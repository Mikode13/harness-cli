export interface IOutput {
	print(message: string): void;
	printError(error: unknown): void;
}

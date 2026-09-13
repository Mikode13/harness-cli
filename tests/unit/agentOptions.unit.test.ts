import { describe, expect, it } from 'vitest';
import { parseHarnessArgs } from '../../src/agentOptions.js';
import { CliUsageError } from '../../src/errors.js';

describe('parseHarnessArgs', () => {
	it('reads every agent option', () => {
		const args = [
			'--agent',
			'codex',
			'--model',
			'gpt-5.6-luna',
			'--reasoning-effort',
			'xhigh',
			'--auto-approve',
		];

		expect(parseHarnessArgs(args, { allowPositionals: false })).toEqual({
			options: {
				provider: 'codex',
				model: 'gpt-5.6-luna',
				reasoningEffort: 'xhigh',
				autoApprove: true,
			},
			positionals: [],
		});
	});

	it('leaves the agent unset and the permission bypass off by default', () => {
		const { options } = parseHarnessArgs([], { allowPositionals: false });

		expect(options.provider).toBeUndefined();
		expect(options.autoApprove).toBe(false);
	});

	it('returns the positionals when the caller allows them', () => {
		const { positionals } = parseHarnessArgs(['--agent', 'claude', 'review this diff'], {
			allowPositionals: true,
		});

		expect(positionals).toEqual(['review this diff']);
	});

	it.each([
		['a positional the caller does not allow', ['review this diff']],
		['an unknown agent', ['--agent', 'gemini']],
		['an unknown option', ['--json']],
		['an option without its value', ['--agent']],
	])('rejects %s as a usage error', (_case, args) => {
		expect(() => parseHarnessArgs(args, { allowPositionals: false })).toThrow(CliUsageError);
	});
});

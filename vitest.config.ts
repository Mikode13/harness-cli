import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

function fake(file: string): string {
	return fileURLToPath(new URL(`./tests/support/fakes/${file}`, import.meta.url));
}

export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: 'unit',
					include: ['tests/unit/**/*.unit.test.ts'],
				},
			},
			{
				// The real harness runs here; only the provider SDKs it imports are replaced.
				resolve: {
					alias: {
						'@anthropic-ai/claude-agent-sdk': fake('claudeAgentSdk.fake.ts'),
						'@openai/codex-sdk': fake('codexSdk.fake.ts'),
					},
				},
				test: {
					name: 'integration',
					include: ['tests/integration/**/*.integration.test.ts'],
					// Vite has to process the harness for its SDK imports to reach the aliases.
					server: { deps: { inline: ['@mikode13/harness'] } },
				},
			},
		],
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
		},
	},
});

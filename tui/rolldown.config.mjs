import { transformAsync } from '@babel/core';
import typescript from '@babel/preset-typescript';
import solid from 'babel-preset-solid';
import { defineConfig } from 'rolldown';

export default defineConfig({
	input: ['main.tsx', 'smoke.tsx'],
	platform: 'node',
	external: [/^@opentui\//, /^solid-js(?:\/|$)/, '@mikode13/harness'],
	plugins: [
		{
			name: 'solid-terminal',
			transform: {
				filter: { id: /\.tsx$/ },
				async handler(source, filename) {
					const result = await transformAsync(source, {
						filename,
						presets: [[solid, { generate: 'universal', moduleName: '@opentui/solid' }], typescript],
					});
					return result.code;
				},
			},
		},
	],
	output: { dir: 'dist', format: 'esm' },
});

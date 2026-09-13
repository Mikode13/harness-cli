import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const repositoryRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every `.ts` file under `src`, relative to `src`, so the walk survives future subdirectories. */
async function sourceFiles(directory, prefix = '') {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const relative = path.posix.join(prefix, entry.name);

		if (entry.isDirectory()) {
			files.push(...(await sourceFiles(path.join(directory, entry.name), relative)));
		} else if (entry.name.endsWith('.ts')) {
			files.push(relative);
		}
	}

	return files;
}

const manifest = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));

// tsconfig.build.json emits JavaScript only: the package is an application with no importable
// API, so it ships neither declarations nor source maps that point to unpublished sources.
const emitted = (await sourceFiles(path.join(repositoryRoot, 'src'))).map(
	source => `dist/${source.replace(/\.ts$/, '.js')}`,
);

// npm always includes these three regardless of the `files` field. LICENSE is required in
// every published artifact by the MiKode licensing standard.
const expected = new Set([...emitted, 'LICENSE', 'package.json', 'README.md']);

const { stdout } = await execFileAsync('pnpm', ['pack', '--dry-run', '--json'], {
	cwd: repositoryRoot,
});

// `pnpm pack` prints the lifecycle output of `prepare` and `prepack` before the JSON.
const packed = JSON.parse(stdout.slice(stdout.indexOf('{')));
const actual = new Set(packed.files.map(file => file.path));

const missing = [...expected].filter(file => !actual.has(file)).sort();
const unexpected = [...actual].filter(file => !expected.has(file)).sort();

const problems = [];

if (missing.length > 0) {
	problems.push(`Missing from the tarball:\n${missing.map(file => `  - ${file}`).join('\n')}`);
}

if (unexpected.length > 0) {
	problems.push(
		`Unexpected in the tarball:\n${unexpected.map(file => `  - ${file}`).join('\n')}\n` +
			'  Output of a renamed or deleted source file is the usual cause; `pnpm run build`\n' +
			'  removes `dist` first, so a stale file here means the tarball was not rebuilt.',
	);
}

// The command is the package's only entry point: a bin target that is absent from the
// tarball, or that lacks the shebang, installs a command that cannot run.
const bins =
	typeof manifest.bin === 'string'
		? [[manifest.name, manifest.bin]]
		: Object.entries(manifest.bin ?? {});

if (bins.length === 0) {
	problems.push('package.json declares no bin, but the package is a command-line application.');
}

for (const [name, target] of bins) {
	const file = path.posix.normalize(target.replace(/^\.\//, ''));

	if (!actual.has(file)) {
		problems.push(`bin.${name} -> ${target} is absent from the tarball.`);
		continue;
	}

	const [firstLine] = (await readFile(path.join(repositoryRoot, file), 'utf8')).split('\n', 1);
	if (firstLine !== '#!/usr/bin/env node') {
		problems.push(`bin.${name} -> ${target} does not start with "#!/usr/bin/env node".`);
	}
}

if (problems.length > 0) {
	process.stderr.write(`${problems.join('\n\n')}\n`);
	process.exit(1);
}

process.stdout.write(
	`The publishable tarball contains exactly the ${String(expected.size)} expected files, ` +
		`and every command it declares is present with its shebang.\n`,
);

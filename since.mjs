import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import glob from 'glob-gitignore';

const packagesDir = path.join(import.meta.dirname, 'packages');

/** @typedef {{ private?: boolean, name: string, version: string}} PackageJSON */

/** @type {[string, PackageJSON][]} */
const packages = (process.argv.length > 2 ? [process.argv[2]] : glob.sync('*', { cwd: packagesDir }))
	.map((/** @type {string} */ name) => path.join(packagesDir, name, 'package.json'))
	.filter((/** @type {string} */ packagePath) => fs.existsSync(packagePath))
	.map((/** @type {string} */ packagePath) => /** @type {const} */ ([
		path.basename(path.dirname(packagePath)),
		/** @type {PackageJSON} */ (JSON.parse(`${fs.readFileSync(packagePath)}`)),
	]))
	.filter(/** @type {(x: [string, PackageJSON]) => boolean} */ ([, x]) => !x.private && x.name !== 'tests');

packages.forEach(([dirName, pkg]) => {
	const tag = `${pkg.name}@${pkg.version}`;
	const dir = path.join(packagesDir, dirName);
	const logArgs = [
		'--no-pager',
		'log',
		'--oneline',
		`${tag}..HEAD`,
		dir,
		':!**/.eslintrc',
	];
	const log = spawnSync('git', logArgs, { stdio: 'pipe' });
	if (log.stdout.length > 0 || log.stderr.length > 0) {
		console.log(tag);
		spawnSync('git', logArgs, { stdio: 'inherit' });
		console.log('\n');
	}
});

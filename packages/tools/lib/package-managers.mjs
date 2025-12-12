/**
 * Centralized definition of package managers and their lockfile configurations.
 * This is the single source of truth for all valid package managers and lockfile names.
 *
 * IMPORTANT: Keep in sync with package-managers.d.mts
 * @type {typeof import('./package-managers.d.mts').PACKAGE_MANAGERS}
 */
export const PACKAGE_MANAGERS = {
	npm: {
		lockfiles: ['package-lock.json', 'npm-shrinkwrap.json'],
		defaultLockfile: 'package-lock.json',
	},
	yarn: {
		lockfiles: ['yarn.lock'],
		defaultLockfile: 'yarn.lock',
	},
	pnpm: {
		lockfiles: ['pnpm-lock.yaml'],
		defaultLockfile: 'pnpm-lock.yaml',
	},
	bun: {
		lockfiles: ['bun.lock', 'bun.lockb'],
		defaultLockfile: 'bun.lock',
	},
	vlt: {
		lockfiles: ['vlt-lock.json'],
		defaultLockfile: 'vlt-lock.json',
	},
};

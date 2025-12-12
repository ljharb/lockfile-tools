declare module '@istanbuljs/esm-loader-hook' {
	export function load(
		url: string,
		context: { format?: string },
		nextLoad: (url: string, context: { format?: string }) => Promise<{ format: string; source: string | Uint8Array }>
	): Promise<{ format: string; source: string }>;
}

declare module '@istanbuljs/load-nyc-config' {
	export function loadNycConfig(options?: { cwd?: string }): Promise<Record<string, unknown>>;
	export function isLoading(): boolean;
}

declare module '@istanbuljs/schema' {
	export const defaults: {
		nyc: Record<string, unknown>;
	};
}

declare module 'test-exclude' {
	interface TestExcludeOptions {
		cwd?: string;
		include?: string[];
		exclude?: string[];
		extension?: string[];
		excludeNodeModules?: boolean;
	}

	class TestExclude {
		constructor(options?: TestExcludeOptions);
		shouldInstrument(filename: string): boolean;
	}

	export = TestExclude;
}

// Register istanbul ESM loader hook for coverage instrumentation
// Use register() API instead of deprecated --experimental-loader
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('@istanbuljs/esm-loader-hook', pathToFileURL('./'));

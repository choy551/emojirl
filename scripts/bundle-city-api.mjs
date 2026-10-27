/**
 * Vercel transpiles api/*.ts and leaves import specifiers unchanged.
 * A `.ts` import of src/server then crashes the function with ERR_MODULE_NOT_FOUND.
 * This writes one JavaScript bundle the routes can import.
 */
import { build } from 'esbuild';

await build({
  entryPoints: ['src/server/cityShareHttp.ts'],
  outfile: 'api/cityShareBundle.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  legalComments: 'none',
});

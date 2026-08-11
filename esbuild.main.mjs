// Sandbox bundle. The Figma sandbox has no module loader, so `main` must be a
// single IIFE without imports. See PRD §4.1.
import esbuild from 'esbuild'

const watch = process.argv.includes('--watch')

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/main/index.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2017',
  platform: 'neutral',
  outfile: 'dist/main.js',
  logLevel: 'info',
  legalComments: 'none',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
}

if (watch) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
  console.log('[esbuild] watching src/main …')
} else {
  await esbuild.build(options)
}

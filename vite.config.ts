import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

const { version } = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as {
  version: string
}

/**
 * The manifest points at `dist/ui.html`, Vite emits `index.html`. Renaming in
 * `generateBundle` (post) keeps the build a single command with no temp files.
 */
function renameHtml(): Plugin {
  return {
    name: 'figtations:rename-html',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const key of Object.keys(bundle)) {
        if (!key.endsWith('index.html')) continue
        const asset = bundle[key]
        if (!asset) continue
        delete bundle[key]
        asset.fileName = 'ui.html'
        bundle['ui.html'] = asset
      }
    },
  }
}

export default defineConfig({
  root: 'src/ui',
  plugins: [react(), viteSingleFile(), renameHtml()],
  // The header shows the version; reading it here keeps it from drifting.
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    target: 'es2020',
    outDir: '../../dist',
    emptyOutDir: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100 * 1024 * 1024,
    reportCompressedSize: false,
  },
})

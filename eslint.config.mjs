import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // src/shared is imported from both runtimes (PRD §4.1b) and must therefore
    // touch neither the Figma API nor the DOM. Enforced, not conventional.
    files: ['src/shared/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'figma', message: 'src/shared must not use the Figma API.' },
        { name: 'window', message: 'src/shared must not use DOM APIs.' },
        { name: 'document', message: 'src/shared must not use DOM APIs.' },
        { name: 'fetch', message: 'src/shared must not use network APIs.' },
        { name: 'localStorage', message: 'src/shared must not use DOM APIs.' },
      ],
    },
  },
  {
    // The sandbox has no DOM and no network.
    files: ['src/main/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'The Figma sandbox has no DOM.' },
        { name: 'document', message: 'The Figma sandbox has no DOM.' },
        { name: 'fetch', message: 'networkAccess is "none"; the sandbox has no fetch.' },
        { name: 'localStorage', message: 'Use figma.clientStorage instead.' },
      ],
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'figma', message: 'The UI iframe has no Figma API; use RPC.' },
        { name: 'fetch', message: 'networkAccess is "none".' },
      ],
    },
  },
  {
    files: ['*.mjs', '*.config.ts'],
    rules: { 'no-console': 'off' },
  }
)

import globals from 'globals'
import pluginJs from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import mochaPlugin from 'eslint-plugin-mocha'

export default [
  {
    ignores: ['dist', 'coverage', '.nyc_output'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      semi: ['error', 'never'],
    },
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettierRecommended,
  mochaPlugin.configs.flat.recommended,
]

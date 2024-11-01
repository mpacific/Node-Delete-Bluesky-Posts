import globals from 'globals'
import pluginJs from '@eslint/js'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import mochaPlugin from 'eslint-plugin-mocha'

export default [
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: {
      semi: ['error', 'never'],
    },
  },
  pluginJs.configs.recommended,
  eslintPluginPrettierRecommended,
  mochaPlugin.configs.flat.recommended,
]

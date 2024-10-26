import globals from 'globals'
import pluginJs from '@eslint/js'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'

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
]

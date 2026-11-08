import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import testingLibrary from 'eslint-plugin-testing-library';

export default [
  { ignores: ['build', 'build-demo', 'coverage'] },
  js.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  jsxA11y.flatConfigs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: { globals: globals.browser },
    settings: { react: { version: 'detect' } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The rules Create React App had for hooks; the compiler rules of the plugin's
      // recommended set are for the React Compiler, which this app does not use.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // No PropTypes: the components are only used inside this app.
      'react/prop-types': 'off',
      // Fields get the focus only in forms the user has just opened (new PIN, the sheet).
      'jsx-a11y/no-autofocus': 'off',
    },
  },
  {
    files: ['src/**/*.test.{js,jsx}', 'src/setupTests.js', 'src/test-utils.jsx'],
    ...testingLibrary.configs['flat/react'],
    languageOptions: { globals: { ...globals.browser, ...globals.vitest } },
    rules: {
      ...testingLibrary.configs['flat/react'].rules,
      // Some tests check visual states (CSS classes of the PIN boxes), which have no role.
      'testing-library/no-node-access': 'off',
      'testing-library/no-container': 'off',
    },
  },
  {
    files: ['*.config.js'],
    languageOptions: { globals: globals.node },
  },
];

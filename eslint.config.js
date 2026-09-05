// @ts-check
const expoConfig = require('eslint-config-expo/flat');
const { defineConfig, globalIgnores } = require('eslint/config');

module.exports = defineConfig([
  globalIgnores(['node_modules', '.expo', 'dist', 'test-results', 'test-data', 'public']),
  expoConfig,
  {
    rules: {
      // These two rules assume React Compiler, which this project does not use.
      // The codebase deliberately mutates refs during render (a stable "latest
      // value" ref, safe because it never reads its own value mid-render) and
      // kicks off async work with setState at the top of an effect (the
      // standard pre-Suspense data-loading pattern) to avoid extra re-renders
      // in per-frame render loops.
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]);

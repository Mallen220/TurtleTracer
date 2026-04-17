module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint", "unicorn"],
  ignorePatterns: [
    "node_modules/",
    "dist/",
    "release/",
    "build/",
    "playwright-report/",
    "test-results/",
  ],
  extends: ["plugin:prettier/recommended"],
  rules: {
    "no-lonely-if": "error",
    "unicorn/prefer-global-this": "error",
    "unicorn/prefer-array-find": "error",
    "unicorn/prefer-includes": "error",
    "unicorn/prefer-string-starts-ends-with": "error",
    "unicorn/prefer-string-slice": "error",
    "unicorn/prefer-modern-dom-apis": "error",
    "unicorn/no-negated-condition": "error",
    "unicorn/prefer-array-index-of": "error",
    "unicorn/prefer-top-level-await": "error",
    "unicorn/prefer-node-protocol": "error",
    "unicorn/prefer-export-from": "error",
    "unicorn/no-zero-fractions": "error",
    "unicorn/prefer-number-properties": "error",
  },
  overrides: [
    {
      files: ["**/*.ts"],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        project: ["./tsconfig.eslint.json"],
        tsconfigRootDir: __dirname,
        createDefaultProgram: true,
      },
      extends: ["plugin:prettier/recommended"],
      rules: {
        "@typescript-eslint/prefer-optional-chain": "error",
        "@typescript-eslint/prefer-promise-reject-errors": "error",
      },
    },
    {
      files: ["**/*.svelte"],
      parser: "svelte-eslint-parser",
      parserOptions: {
        parser: "@typescript-eslint/parser",
        extraFileExtensions: [".svelte"],
      },
      extends: ["plugin:svelte/recommended", "plugin:prettier/recommended"],
    },
  ],
};

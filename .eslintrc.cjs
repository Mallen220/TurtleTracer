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
  plugins: ["@typescript-eslint", "unicorn", "unused-imports"],
  ignorePatterns: [
    "node_modules/",
    "dist/",
    "release/",
    "build/",
    "playwright-report/",
    "test-results/",
    "plugins/turtle.d.ts",
  ],
  extends: ["plugin:prettier/recommended"],
  rules: {
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "unused-imports/no-unused-imports": "error",
    "unused-imports/no-unused-vars": [
      "error",
      {
        vars: "all",
        varsIgnorePattern: "^_",
        args: "after-used",
        argsIgnorePattern: "^_",
      },
    ],
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
    "unicorn/prefer-string-raw": "error",
    "unicorn/prefer-at": "error",
    "unicorn/prefer-modern-math-apis": "error",
    // "unicorn/prefer-single-call": "error",
  },
  overrides: [
    {
      // Rules that need type information only work on files the TypeScript
      // program (tsconfig.eslint.json) knows about.
      files: ["**/*.ts", "electron/**/*.js", "public/sw.js"],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        project: ["./tsconfig.eslint.json"],
        tsconfigRootDir: __dirname,
        createDefaultProgram: true,
      },
      extends: ["plugin:prettier/recommended"],
      rules: {
        "no-unused-vars": "off",
        "@typescript-eslint/no-unused-vars": "off",
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/prefer-optional-chain": "error",
        "@typescript-eslint/prefer-promise-reject-errors": "error",
      },
    },
    {
      // The rest of the app reaches the plugin system through
      // src/lib/plugins/index.ts (plus the API types and the plugin form
      // UI), so the plugin host is only loaded once a plugin is on.
      files: ["src/**/*.ts", "src/**/*.svelte"],
      excludedFiles: ["src/lib/plugins/**", "src/tests/**", "src/**/*.test.ts"],
      rules: {
        "@typescript-eslint/no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: [
                  "**/plugins/host/*",
                  "**/plugins/runtime/*",
                  "**/plugins/view/*",
                  "**/plugins/protocol/rpc",
                  "**/plugins/protocol/runtime",
                ],
                allowTypeImports: true,
                message:
                  "Use src/lib/plugins/index.ts: the plugin host is loaded only when plugins are on.",
              },
            ],
          },
        ],
      },
    },
    {
      // These run inside plugin sandboxes, so they can't use the app.
      files: [
        "src/lib/plugins/api/**",
        "src/lib/plugins/protocol/**",
        "src/lib/plugins/runtime/**",
        "src/lib/plugins/view/**",
      ],
      rules: {
        "@typescript-eslint/no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: [
                  "../../*",
                  "../host/*",
                  "../ui/*",
                  "svelte",
                  "svelte/*",
                ],
                message:
                  "Code that runs in a plugin's sandbox may only use the plugin API and protocol.",
              },
            ],
          },
        ],
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

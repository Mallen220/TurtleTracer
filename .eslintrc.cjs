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
  ignorePatterns: [
    "node_modules/",
    "dist/",
    "release/",
    "build/",
    "playwright-report/",
    "test-results/",
  ],
  extends: ["plugin:prettier/recommended"],
  overrides: [
    {
      files: ["**/*.ts"],
      parser: "@typescript-eslint/parser",
      extends: ["plugin:prettier/recommended"],
    },
  ],
};

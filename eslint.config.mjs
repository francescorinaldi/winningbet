import prettier from "eslint-config-prettier";

export default [
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-console": "off",
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": "warn",
    },
  },
  {
    files: ["api/**/*.js"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        URL: "readonly",
        fetch: "readonly",
        Response: "readonly",
      },
    },
  },
  {
    files: ["public/**/*.js"],
    languageOptions: {
      globals: {
        document: "readonly",
        window: "readonly",
        navigator: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        fetch: "readonly",
        IntersectionObserver: "readonly",
        HTMLElement: "readonly",
        Event: "readonly",
        location: "readonly",
        devicePixelRatio: "readonly",
        innerWidth: "readonly",
        innerHeight: "readonly",
        matchMedia: "readonly",
      },
    },
  },
  {
    ignores: ["node_modules/", ".vercel/"],
  },
  prettier,
];

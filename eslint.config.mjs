import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import { fixupConfigRules } from "@eslint/compat";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Global ignores - must be first
  {
    ignores: [
      // Next.js
      ".next/**",
      "out/**",
      "build/**",
      "dist/**",

      // Dependencies
      "node_modules/**",

      // TypeScript
      "*.tsbuildinfo",
      "next-env.d.ts",

      // Prisma
      "prisma/migrations/**/*.sql",

      // Data directories
      "data/**",

      // Git worktrees (CI branches checked out locally)
      ".worktrees/**",

      // Documentation and scripts (not part of main app)
      "docs/**",
      "internal/**",
      "maintenance_scripts/**",
      "scripts/**",

      // Third-party bundles in public/
      "public/**/*.js",

      // Misc
      ".vercel/**",
      "coverage/**",
      ".kilocode/**",

      // Build artifacts
      "*.js.map",
      "*.d.ts.map",
    ],
  },

  // Extend Next.js and security configs
  ...fixupConfigRules(compat.extends("plugin:security/recommended-legacy")),
  ...nextVitals,
  ...nextTs,

  // Tests use temp dirs/fixtures; these rules flag any non-literal path.
  {
    files: ["**/*.{test,spec}.ts", "**/*.{test,spec}.tsx"],
    rules: {
      "security/detect-non-literal-fs-filename": "off",
      "security/detect-unsafe-regex": "off",
    },
  },

  // Explicit defaults for @typescript-eslint/no-unused-expressions to avoid
  // ESLint 9.30.1 + @typescript-eslint v7 TypeError on undefined options[0].
  {
    rules: {
      "@typescript-eslint/no-unused-expressions": [
        "error",
        {
          allowShortCircuit: false,
          allowTernary: false,
          allowTaggedTemplates: false,
        },
      ],
    },
  },

  // Files that intentionally use require() with v8-style no-require-imports disables.
  {
    files: [
      "next.config.ts",
      "**/*.cjs",
      "src/app/api/settings/backup/route.exec.test.ts",
      "src/app/api/settings/backup/versions/filename.paths.test.ts",
      "tailwind.config.ts",
    ],
    rules: {
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // ponytail: eslint-config-next 16 ships react-hooks v7 React Compiler rules (~200 hits).
  // Off to keep parity with the Next 15 lint baseline; enable and fix incrementally later.
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/error-boundaries": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/static-components": "off",
    },
  },
];

export default eslintConfig;


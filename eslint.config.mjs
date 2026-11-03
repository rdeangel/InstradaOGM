import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

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
  ...compat.extends(
    "plugin:security/recommended-legacy",
    "next/core-web-vitals",
    "next/typescript"
  ),

  // Tests use temp dirs/fixtures; these rules flag any non-literal path.
  {
    files: ["**/*.{test,spec}.ts", "**/*.{test,spec}.tsx"],
    rules: {
      "security/detect-non-literal-fs-filename": "off",
      "security/detect-unsafe-regex": "off",
    },
  },
];

export default eslintConfig;


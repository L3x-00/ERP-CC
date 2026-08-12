import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // El entorno local de agentes no forma parte del producto ni de sus reglas.
    ".agents/**",
    ".ai-shared/**",
    ".claude/**",
    ".codex/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;

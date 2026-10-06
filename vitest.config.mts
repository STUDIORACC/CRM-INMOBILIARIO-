import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      "server-only": path.resolve(root, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    // Los tests de integración corren contra Postgres embebido (PGlite) en memoria, con el mismo
    // esquema, RLS y triggers de producción. Cada archivo de test tiene su propia base aislada.
    env: { DEMO_IN_MEMORY: "1", DATABASE_URL: "", TZ: "UTC" },
  },
});

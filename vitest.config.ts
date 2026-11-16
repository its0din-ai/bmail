import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["worker/test/**/*.test.ts", "client/test/**/*.test.ts"],
    environment: "node",
  },
});

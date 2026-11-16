import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Die Integrationstests teilen sich eine Test-Datenbank und laufen deshalb nacheinander.
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});

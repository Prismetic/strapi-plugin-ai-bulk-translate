import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Deep modules (field extractor, chunker, path codec, locale status) are pure
    // and run in node. Admin component tests added later will opt into jsdom per-file.
    environment: 'node',
    include: ['server/src/**/*.test.ts', 'admin/src/**/*.test.{ts,tsx}'],
  },
});

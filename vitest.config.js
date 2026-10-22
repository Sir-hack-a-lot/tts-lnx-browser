import { defineConfig } from 'vitest/config';

// DOM-tests zetten bovenaan: // @vitest-environment jsdom
export default defineConfig({ test: { environment: 'node' } });

import { config } from 'dotenv';
config({ path: '.env' });

// React Testing Library: auto-cleanup between tests.
// Vitest doesn't install the jest global hooks for new RTL versions, so we wire afterEach manually.
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(() => {
  cleanup();
});

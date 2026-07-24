import { config } from 'dotenv';
config({ path: '.env' });

// React Testing Library: auto-cleanup between tests.
// vitest 4 要求 afterEach 必须在 suite context(beforeAll/describe 内)调用,否则报错 "failed to find the current suite"。
// 这里用顶级 beforeAll 包一层,使 afterEach 在 suite 内执行。
import { beforeAll, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

beforeAll(() => {
  afterEach(() => {
    cleanup();
  });
});
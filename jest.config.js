/** @type {import('jest').Config} */
const config = {
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/__tests__/unit/**/*.test.ts'],
      testTimeout: 10_000,
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/__tests__/integration/**/*.test.ts'],
      testTimeout: 30_000,
    },
    {
      displayName: 'e2e',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/__tests__/e2e/**/*.test.ts'],
      testTimeout: 60_000,
    },
  ],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
};

module.exports = config;

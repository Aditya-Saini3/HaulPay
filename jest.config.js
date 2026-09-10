/**
 * The earnings engine and the adapter layer are deliberately free of React
 * Native imports, so they are tested as plain TypeScript under Node. No
 * react-native preset, no native mocks, no transform of node_modules.
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  collectCoverageFrom: [
    "src/earnings/**/*.ts",
    "!src/earnings/**/__tests__/**",
  ],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
          target: "es2022",
          lib: ["es2022"],
          strict: true,
          noUncheckedIndexedAccess: true,
          esModuleInterop: true,
          skipLibCheck: true,
        },
      },
    ],
  },
};

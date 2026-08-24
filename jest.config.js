/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    /**
     * The native bricks are tested by rendering them in jsdom through
     * `react-native-web` — the same mapping the console preview uses, which is
     * what makes that preview show the real native renderer rather than an
     * impression of it.
     *
     * What this checks is layout and styling decisions. Keyboard behaviour,
     * gestures and scroll physics are not a browser's to reproduce, and no
     * assertion here pretends otherwise.
     */
    "^react-native$": "react-native-web",
  },
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.test.tsx"],
};

import { nodeConfig } from "@kiranabar/config/eslint/node";

export default [
  ...nodeConfig,
  {
    rules: {
      "@typescript-eslint/no-extraneous-class": "off",
    },
  },
];

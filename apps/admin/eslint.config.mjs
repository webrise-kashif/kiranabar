import globals from "globals";
import { reactConfig } from "@kiranabar/config/eslint/react";

export default [
  ...reactConfig,
  {
    languageOptions: {
      globals: globals.browser,
    },
  },
];

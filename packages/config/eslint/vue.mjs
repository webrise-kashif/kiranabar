import vue from "eslint-plugin-vue";
import tseslint from "typescript-eslint";
import { baseConfig } from "./base.mjs";

/** Vue 3 (Nuxt) Composition API configuration. */
export const vueConfig = tseslint.config(...baseConfig, ...vue.configs["flat/recommended"], {
  files: ["**/*.vue"],
  languageOptions: {
    parserOptions: {
      parser: tseslint.parser,
      extraFileExtensions: [".vue"],
    },
  },
  rules: {
    "vue/multi-word-component-names": "off",
  },
});

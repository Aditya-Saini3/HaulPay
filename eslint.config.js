const expoConfig = require("eslint-config-expo/flat");

module.exports = [
  ...expoConfig,
  {
    ignores: ["dist/*", "node_modules/*", ".expo/*", "coverage/*"],
  },
  {
    rules: {
      "import/no-unresolved": "off",
    },
  },
];

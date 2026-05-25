import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "electron-vite";
import { resolve } from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { imagetools } from "vite-imagetools";

function forceExternalOverride(external) {
  return {
    name: "force-external-override",
    config(config, { command }) {
      if (!config.build) config.build = {};
      if (!config.build.rollupOptions) config.build.rollupOptions = {};

      config.build.rollupOptions.external = external;
    },
  };
}

export default defineConfig({
  main: {
    plugins: [],
  },
  preload: {
    plugins: [forceExternalOverride(["electron"])],
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
      },
    },
    plugins: [
      /** Plugins */
      react(),
      tailwindcss(),
      imagetools(),
      nodePolyfills({
        globals: {
          Buffer: false,
        },
      }),
    ],
  },
});

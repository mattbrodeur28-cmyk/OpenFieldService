import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [
    preact(),
    {
      name: "single-preact-runtime",
      generateBundle(_options, bundle) {
        const modules = Object.values(bundle).flatMap((chunk) =>
          chunk.type === "chunk" ? Object.keys(chunk.modules) : [],
        );
        const duplicateRuntime = modules.find((id) =>
          /[/\\]node_modules[/\\](react|react-dom)[/\\]/.test(id),
        );
        if (duplicateRuntime)
          this.error(
            `Unexpected React runtime in Preact build: ${duplicateRuntime}`,
          );
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});

import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist",
    target: "esnext",
    // Optimize bundle size
    minify: "esbuild",
    // Enable CSS minification
    cssMinify: "esbuild",
    rollupOptions: {
      output: {
        // Optimize chunk splitting for better caching
        manualChunks: {
          // Tauri API in separate chunk (often unchanged between builds)
          tauri: ["@tauri-apps/api"],
        },
      },
      treeshake: {
        // More aggressive tree-shaking
        moduleSideEffects: "no-external",
        propertyReadSideEffects: false,
        tryCatchDeoptimization: false,
      },
    },
    // Chunk size warning
    chunkSizeWarningLimit: 100,
  },
  // Enable esbuild minification options
  esbuild: {
    // Remove console.log in production
    drop: ["console", "debugger"],
    // Pure functions that can be removed if result is unused
    pure: ["console.log", "console.info", "console.debug", "console.warn"],
    // Minimize identifiers
    minifyIdentifiers: true,
    minifySyntax: true,
    minifyWhitespace: true,
    // Target modern browsers only
    target: "esnext",
  },
  server: {
    port: 8330,
  },
});

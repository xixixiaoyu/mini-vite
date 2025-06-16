import { defineConfig } from '../../dist/index.js';

export default defineConfig({
  root: '.',
  base: '/',
  publicDir: 'public',
  
  server: {
    port: 3000,
    host: 'localhost',
    open: true,
    hmr: true,
  },
  
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    minify: 'esbuild',
    target: 'es2020',
  },
  
  optimizeDeps: {
    entries: ['index.html'],
    exclude: [],
    include: [],
  },
  
  plugins: [
    // 可以在这里添加自定义插件
  ],
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  return {
    server: {
      host: '127.0.0.1',
      port: 3000,
      strictPort: false,
      open: true,
      proxy: {
        '/v0': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          secure: false
        },
        '/api': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          secure: false
        }
      }
    },
    define: {
      global: 'globalThis',
    },
    resolve: {
      alias: {
        buffer: 'buffer',
      },
    },
    optimizeDeps: {
      include: ['buffer', 'ethers'],
    },
    build: {
      outDir: 'dist',
      commonjsOptions: { transformMixedEsModules: true },
      chunkSizeWarningLimit: 500,
      // Optimize for production - use esbuild (default, faster than terser)
      minify: 'esbuild',
      rollupOptions: {
        external: [],
        output: {
          // Smart chunk splitting for better caching
          manualChunks(id) {
            if (id.includes('node_modules')) {
              // Vendor chunks - split by package for better caching
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
                return 'vendor-react';
              }
              if (id.includes('ethers')) {
                return 'vendor-ethers';
              }
              if (id.includes('chart') || id.includes('echarts') || id.includes('highcharts') || id.includes('recharts')) {
                return 'vendor-charts';
              }
              // Other vendor code
              return 'vendor';
            }
          },
          // Optimize asset file names for caching
          assetFileNames: (assetInfo) => {
            const info = assetInfo.name.split('.');
            const ext = info[info.length - 1];
            if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
              return `assets/images/[name]-[hash][extname]`;
            }
            if (/woff2?|eot|ttf|otf/i.test(ext)) {
              return `assets/fonts/[name]-[hash][extname]`;
            }
            return `assets/[name]-[hash][extname]`;
          },
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
        },
      },
      // Target modern browsers for smaller bundles
      target: 'es2020',
      // Enable source maps for error tracking (optional)
      sourcemap: false,
    },
    plugins: [react()],
    css: {
      // Optimize CSS
      devSourcemap: false,
    },
    // Esbuild optimizations for production
    esbuild: {
      legalComments: 'none',
      // Drop console.log and debugger in production
      drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
    },
  };
});

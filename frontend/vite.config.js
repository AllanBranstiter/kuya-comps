/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // Vitest configuration
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
  
  // Build output to static/react folder so both old and new can coexist
  build: {
    outDir: '../static/react',
    emptyOutDir: true,
    // Generate sourcemaps for debugging
    sourcemap: true,
    rollupOptions: {
      output: {
        // Use consistent chunk naming for caching
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        // Manual chunk splitting for better caching
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'supabase': ['@supabase/supabase-js'],
          'zustand': ['zustand']
        }
      }
    }
  },
  
  // Set base path for FastAPI serving
  // In production, assets will be served from /static/react/
  base: '/static/react/',
  
  // Development server configuration
  server: {
    port: 5173,
    // Proxy API calls to FastAPI backend during development
    proxy: {
      '/comps': {
        target: 'http://localhost:8000',
        changeOrigin: true
      },
      '/active': {
        target: 'http://localhost:8000',
        changeOrigin: true
      },
      '/fmv': {
        target: 'http://localhost:8000',
        changeOrigin: true
      },
      '/health': {
        target: 'http://localhost:8000',
        changeOrigin: true
      },
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      },
      '/admin': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  },
  
  // Resolve aliases for cleaner imports
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@contexts': path.resolve(__dirname, './src/contexts'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@styles': path.resolve(__dirname, './src/styles')
    }
  }
});

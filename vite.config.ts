import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import Terminal from 'vite-plugin-terminal';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    Terminal(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'AI 小说写作助手',
        short_name: 'AI小说',
        description: '基于 AI 的小说创作辅助工具',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  server: {
    port: 8002,
    host: true,
    strictPort: true,
    // --- 性能调查：确保手机端 terminal 请求能顺利通过 CORS ---
    cors: true,
    hmr: {
      overlay: true,
    },
  },
});

import react from '@vitejs/plugin-react';
import { defineConfig, Plugin, ViteDevServer } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import Terminal from 'vite-plugin-terminal';
import * as fs from 'fs';
import * as path from 'path';

function skillsWatcherPlugin(): Plugin {
  return {
    name: 'skills-watcher',
    configureServer(server: ViteDevServer) {
      const skillsDir = path.join(process.cwd(), 'skills');
      
      const watchSkillsFolder = () => {
        if (fs.existsSync(skillsDir)) {
          const watcher = fs.watch(skillsDir, (eventType, filename) => {
            if (filename && filename.endsWith('.md')) {
              server.ws.send({
                type: 'custom',
                event: 'skills-changed',
                data: { filename, eventType }
              });
            }
          });
          
          return () => watcher.close();
        }
      };
      
      watchSkillsFolder();
      
      server.middlewares.use('/api/skills/list', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        
        try {
          if (!fs.existsSync(skillsDir)) {
            res.writeHead(200);
            res.end(JSON.stringify([]));
            return;
          }
          
          const files = fs.readdirSync(skillsDir).filter(file => file.endsWith('.md'));
          res.writeHead(200);
          res.end(JSON.stringify(files));
        } catch (error) {
          console.error('Error listing skills:', error);
          res.writeHead(500);
          res.end(JSON.stringify([]));
        }
      });
      
      server.middlewares.use('/api/skills/file', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        
        try {
          const url = new URL(req.url || '', 'http://localhost');
          const fileName = url.searchParams.get('name');
          
          if (!fileName) {
            res.writeHead(400);
            res.end('Missing name parameter');
            return;
          }
          
          const filePath = path.join(skillsDir, fileName);
          
          if (!fs.existsSync(filePath)) {
            res.writeHead(404);
            res.end('File not found');
            return;
          }
          
          const content = fs.readFileSync(filePath, 'utf-8');
          res.writeHead(200);
          res.end(content);
        } catch (error) {
          console.error('Error reading skill file:', error);
          res.writeHead(500);
          res.end('Error reading file');
        }
      });
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    Terminal(),
    skillsWatcherPlugin(),
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

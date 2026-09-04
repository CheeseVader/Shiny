import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import brandConfig from '../brand.config.json' with { type: 'json' };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const appName = env.VITE_APP_NAME || brandConfig.name || 'Shiny';
  const shortName = env.VITE_APP_SHORT_NAME || brandConfig.shortName || appName;
  const description = env.VITE_APP_DESCRIPTION || brandConfig.description || 'Plataforma de administraciÃ³n TCG';
  const primaryColor = env.VITE_APP_PRIMARY_COLOR || brandConfig.primaryColor || '#121620';
  const icon192 = brandConfig.pwaIcon192 || '/pwa-192x192.png';
  const icon512 = brandConfig.pwaIcon512 || '/pwa-512x512.png';
  const maskableIcon512 = brandConfig.maskableIcon512 || '/maskable-icon-512x512.png';
  return ({
  plugins: [
    {
      name: 'generic-brand-html',
      transformIndexHtml(html) {
        return html
          .replaceAll('%APP_NAME%', appName)
          .replaceAll('%APP_SHORT_NAME%', shortName)
          .replaceAll('%APP_PRIMARY_COLOR%', primaryColor);
      }
    },
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['shiny-apple-touch-180x180.png'],
      manifest: {
        id: '/admin',
        name: appName,
        short_name: shortName,
        description,
        start_url: '/admin',
        scope: '/',
        display: 'fullscreen',
        orientation: 'any',
        background_color: primaryColor,
        theme_color: primaryColor,
        icons: [
          {
            src: icon192,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: icon512,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: maskableIcon512,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}']
      }
    })
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true
      }
    }
  }
  });
});




import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  /** Project Pages need a repo subpath; local/dev stays at `/`. */
  const pagesBase = mode === 'pages' ? '/outline/' : '/';

  return {
    base: pagesBase,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'Outline',
          short_name: 'Outline',
          description: 'Local-first chronological outline editor',
          theme_color: '#1a1f1c',
          background_color: '#f3efe6',
          display: 'standalone',
          start_url: pagesBase,
          icons: [
            {
              src: 'favicon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,ico,woff2}'],
          navigateFallback: 'index.html',
          mode: 'development',
        },
        devOptions: {
          enabled: false,
        },
        minify: false,
      }),
    ],
    worker: {
      format: 'es',
    },
  };
});

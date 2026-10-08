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
        // Prompt so we can show an in-app "update available" banner.
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'icon.svg', 'apple-touch-icon.svg'],
        manifest: {
          id: pagesBase,
          name: 'Outline',
          short_name: 'Outline',
          description: 'Local-first chronological outline editor',
          theme_color: '#161a17',
          background_color: '#161a17',
          display: 'standalone',
          display_override: ['standalone', 'browser'],
          orientation: 'any',
          start_url: pagesBase,
          scope: pagesBase,
          lang: 'en',
          categories: ['productivity', 'utilities'],
          icons: [
            {
              src: 'icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: 'icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'maskable',
            },
            {
              src: 'favicon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
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

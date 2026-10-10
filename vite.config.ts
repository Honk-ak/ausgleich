import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base './' = relative Pfade, damit die App unter github.io/<repo>/ ohne Anpassung läuft.
export default defineConfig(({ mode }) => {
  // „npm run demo“ startet ohne Firebase mit Daten im Arbeitsspeicher.
  const demo = mode === 'demo';
  return {
  base: './',
  define: demo ? { __FAIR_DEMO__: 'true' } : { __FAIR_DEMO__: 'false' },
  resolve: demo ? { alias: [{ find: /^(\.\.?)\/store$/, replacement: fileURLToPath(new URL('./src/store.demo.ts', import.meta.url)) }] } : undefined,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Ausgleich.app – gemeinsam ausgeben, fair ausgleichen',
        short_name: 'Ausgleich',
        description: 'Gemeinsam erleben. Nebenbei erfassen. Am Ende fair ausgleichen.',
        lang: 'de',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#F6F8F8',
        theme_color: '#1F5F66',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
};
});

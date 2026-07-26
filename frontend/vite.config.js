// frontend/vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        port: 5173,
        // Разрешаем туннели (Ngrok / Cloudflare / Localtunnel)
        allowedHosts: true,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:3000',
                changeOrigin: true,
                secure: false
            }
        }
    }
});
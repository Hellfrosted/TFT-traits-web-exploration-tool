const path = require('node:path');
const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');

module.exports = defineConfig({
    base: './',
    plugins: [react()],
    build: {
        outDir: 'build/renderer-dist',
        emptyOutDir: true
    },
    server: {
        host: '127.0.0.1',
        port: 5173,
        strictPort: true
    },
    resolve: {
        alias: {
            '@renderer': path.resolve(__dirname, 'src', 'renderer')
        }
    }
});

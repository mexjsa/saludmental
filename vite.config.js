import { defineConfig } from 'vite'

export default defineConfig({
    base: './',
    root: './',
    build: {
        outDir: 'dist',
    },
    server: {
        port: 3001,
        host: true
    }
})

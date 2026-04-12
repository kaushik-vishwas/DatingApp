import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Single repo-root `.env` — VITE_* vars live there with backend keys
  envDir: path.resolve(__dirname, '..'),
})

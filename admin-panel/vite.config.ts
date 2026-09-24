import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // VITE_* vars live in backend env files (same source as the API server):
  //   npm run dev       → backend/.env
  //   npm run dev:test  → backend/.env + backend/.env.test (test overrides)
  envDir: path.resolve(__dirname, '../backend'),
})

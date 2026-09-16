import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Actions zet GITHUB_REPOSITORY op "gebruiker/repo".
// Project pages draaien onder /repo/, user pages (gebruiker.github.io) onder /.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base = !repo || repo.endsWith('.github.io') ? '/' : `/${repo}/`

export default defineConfig({
  plugins: [react()],
  base,
})

#!/usr/bin/env node
// Start de app tegen de Firebase-emulators (Auth + Firestore) met testdata,
// los van de echte gegevens. De emulators hebben Java 21+ nodig.
//
//   npm run dev:local
import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { firebaseConfig } from '../src/firebase-config.js'

// Eigen poort, en dus een eigen localStorage: de lokale testgegevens raken
// nooit die van `npm run dev` (dat tegen de echte database draait).
const COMMAND = 'node scripts/seed-emulator.mjs && vite --port 5181 --strictPort'

const env = { ...process.env, VITE_USE_EMULATORS: 'true' }

const hasJava = () => {
  try {
    execFileSync('java', ['-version'], { env, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// Homebrew installeert openjdk "keg-only": wel aanwezig, maar niet op het PATH.
if (!hasJava()) {
  const brewJava = [
    '/opt/homebrew/opt/openjdk@21/bin',
    '/opt/homebrew/opt/openjdk/bin',
    '/usr/local/opt/openjdk@21/bin',
  ].find((dir) => existsSync(`${dir}/java`))
  if (brewJava) env.PATH = `${brewJava}:${env.PATH}`
}
if (!hasJava()) {
  console.error('De Firebase-emulators hebben Java 21 of nieuwer nodig. Installeer het met: brew install openjdk@21')
  process.exit(1)
}

const child = spawn(
  'firebase',
  ['emulators:exec', '--only', 'auth,firestore', '--project', firebaseConfig.projectId, COMMAND],
  { stdio: 'inherit', env: { ...env, PATH: `${process.cwd()}/node_modules/.bin:${env.PATH}` } },
)
child.on('exit', (code) => process.exit(code ?? 1))

#!/usr/bin/env node
// Draait een commando tegen de Firebase-emulators (Auth + Firestore), los
// van de echte gegevens. De emulators hebben Java 21+ nodig.
//
//   node scripts/emulators.mjs dev    de app met testdata (npm run dev:local)
//   node scripts/emulators.mjs test   alle tests, ook die tegen Firestore (npm run test:emulator)
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { firebaseConfig } from '../src/firebase-config.js'

// Eigen poort, en dus een eigen localStorage: de lokale testgegevens raken
// nooit die van `npm run dev` (dat tegen de echte database draait).
const COMMANDS = {
  dev: 'node scripts/seed-emulator.mjs && vite --port 5181 --strictPort',
  test: 'vitest run',
}

const mode = process.argv[2]
if (!COMMANDS[mode]) {
  console.error(`Gebruik: node scripts/emulators.mjs <${Object.keys(COMMANDS).join('|')}>`)
  process.exit(1)
}

const env = { ...process.env, VITE_USE_EMULATORS: 'true' }

// Draaien de emulators al (bv. een open `npm run dev:local`), dan de tests
// daartegen; een tweede set emulators kan niet op dezelfde poorten starten.
if (mode === 'test') {
  const running = await fetch('http://127.0.0.1:8080/').then(
    () => true,
    () => false,
  )
  if (running) {
    const { status } = spawnSync('npx', ['vitest', 'run'], { stdio: 'inherit', env })
    process.exit(status ?? 1)
  }
}

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
  ['emulators:exec', '--only', 'auth,firestore', '--project', firebaseConfig.projectId, COMMANDS[mode]],
  { stdio: 'inherit', env: { ...env, PATH: `${process.cwd()}/node_modules/.bin:${env.PATH}` } },
)
child.on('exit', (code) => process.exit(code ?? 1))

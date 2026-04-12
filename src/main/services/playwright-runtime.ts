import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'

const require = createRequire(import.meta.url)
const playwrightPackagePath = require.resolve('playwright/package.json')
const playwrightCliPath = join(dirname(playwrightPackagePath), 'cli.js')

let installPromise: Promise<void> | null = null

const installChromium = () =>
  new Promise<void>((resolve, reject) => {
    const nodeBinary =
      process.env.npm_node_execpath ??
      process.env.NODE ??
      (process.platform === 'win32' ? 'node.exe' : 'node')
    const child = spawn(nodeBinary, [playwrightCliPath, 'install', 'chromium'], {
      windowsHide: true,
      stdio: 'pipe'
    })
    let output = ''

    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.on('error', (error) => {
      reject(new Error(`playwright_install_failed:${error.message}`))
    })
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`playwright_install_failed:${output.trim() || 'unknown_error'}`))
    })
  })

export const ensurePlaywrightChromiumInstalled = async () => {
  const { chromium } = await import('playwright')
  const executablePath = chromium.executablePath()
  if (existsSync(executablePath)) {
    return
  }

  if (!installPromise) {
    installPromise = installChromium()
  }

  try {
    await installPromise
  } finally {
    installPromise = null
  }
}

export const launchPlaywrightChromium = async () => {
  await ensurePlaywrightChromiumInstalled()
  const { chromium } = await import('playwright')
  return chromium.launch({ headless: false })
}

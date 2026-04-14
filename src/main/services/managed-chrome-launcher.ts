import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process'
import { existsSync as nodeExistsSync, mkdirSync as nodeMkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserInspectorStatus } from '../../shared/contracts'

type ManagedChromeChildProcess = Pick<ChildProcess, 'exitCode' | 'killed' | 'once' | 'unref'>
type SpawnFn = (
  command: string,
  args: string[],
  options: { detached: boolean; stdio: 'ignore' }
) => ManagedChromeChildProcess

interface ManagedChromeLauncherOptions {
  extensionPath: string
  profileDir: string
  chromeCandidates?: string[]
  existsSync?: (path: string) => boolean
  mkdirSync?: (path: string, options: { recursive: true }) => void
  spawn?: SpawnFn
  remoteDebuggingPort?: number
}

const CHROME_NOT_FOUND_MESSAGE = '크롬 실행 파일을 찾지 못했습니다.'

export const getDefaultChromeExecutableCandidates = (
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
) => {
  if (platform === 'win32') {
    return [
      env.LOCALAPPDATA
        ? join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
        : null,
      env.PROGRAMFILES
        ? join(env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe')
        : null,
      env['PROGRAMFILES(X86)']
        ? join(env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe')
        : null
    ].filter((value): value is string => Boolean(value))
  }

  if (platform === 'darwin') {
    return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  }

  return ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/snap/bin/chromium']
}

export class ManagedChromeLauncher {
  private readonly chromeCandidates: string[]
  private readonly existsSync: (path: string) => boolean
  private readonly mkdirSync: (path: string, options: { recursive: true }) => void
  private readonly spawn: SpawnFn
  private readonly remoteDebuggingPort: number
  private lastLaunchUrl: string | null = null
  private lastError: string | null = null
  private childProcess?: ManagedChromeChildProcess

  constructor(private readonly options: ManagedChromeLauncherOptions) {
    this.chromeCandidates = options.chromeCandidates ?? getDefaultChromeExecutableCandidates()
    this.existsSync = options.existsSync ?? nodeExistsSync
    this.mkdirSync = options.mkdirSync ?? nodeMkdirSync
    this.spawn = options.spawn ?? ((command, args, spawnOptions) => nodeSpawn(command, args, spawnOptions))
    this.remoteDebuggingPort = options.remoteDebuggingPort ?? 39482
  }

  getStatus(): BrowserInspectorStatus {
    const chromePath = this.resolveChromePath()
    const chromeAvailable = Boolean(chromePath)

    return {
      receiverUrl: '',
      extensionPath: this.options.extensionPath,
      isRunning: false,
      chromeAvailable,
      chromePath: chromePath ?? null,
      chromeProfilePath: this.options.profileDir,
      managedChromeRunning: this.isChildRunning(),
      lastLaunchUrl: this.lastLaunchUrl,
      chromeError: chromeAvailable ? this.lastError : this.lastError ?? CHROME_NOT_FOUND_MESSAGE
    }
  }

  launch(url?: string): BrowserInspectorStatus {
    const chromePath = this.resolveChromePath()

    if (!chromePath) {
      this.lastError = CHROME_NOT_FOUND_MESSAGE
      return this.getStatus()
    }

    try {
      this.mkdirSync(this.options.profileDir, { recursive: true })

      const child = this.spawn(chromePath, this.buildLaunchArgs(url), {
        detached: true,
        stdio: 'ignore'
      })

      this.childProcess = child
      this.lastLaunchUrl = url ?? this.lastLaunchUrl
      this.lastError = null
      child.once?.('exit', () => {
        if (this.childProcess === child) {
          this.childProcess = undefined
        }
      })
      child.unref?.()
    } catch (error) {
      this.lastError = `크롬 실행에 실패했습니다. ${error instanceof Error ? error.message : 'unknown_error'}`
    }

    return this.getStatus()
  }

  private buildLaunchArgs(url?: string) {
    const args = [
      `--user-data-dir=${this.options.profileDir}`,
      `--load-extension=${this.options.extensionPath}`,
      `--disable-extensions-except=${this.options.extensionPath}`,
      `--remote-debugging-port=${this.remoteDebuggingPort}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-session-crashed-bubble',
      '--disable-features=Translate,ChromeWhatsNewUI',
      '--window-size=1480,1000',
      '--window-position=48,48',
      '--new-window'
    ]

    if (url) {
      args.push(url)
    }

    return args
  }

  private resolveChromePath() {
    return this.chromeCandidates.find((candidate) => this.existsSync(candidate)) ?? null
  }

  private isChildRunning() {
    return Boolean(this.childProcess && this.childProcess.exitCode === null && !this.childProcess.killed)
  }
}

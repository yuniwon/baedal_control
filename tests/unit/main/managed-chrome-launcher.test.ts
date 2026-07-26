import { describe, expect, it, vi } from 'vitest'
import { ManagedChromeLauncher } from '../../../src/main/services/managed-chrome-launcher'

describe('ManagedChromeLauncher', () => {
  it('reports detected chrome path and dedicated profile info', () => {
    const launcher = new ManagedChromeLauncher({
      extensionPath: 'C:\\dev\\bedal\\browser-extension\\delivery-menu-inspector',
      profileDir: 'C:\\Users\\WON2\\AppData\\Roaming\\delivery-menu-sync\\managed-chrome',
      chromeCandidates: ['C:\\Users\\WON2\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'],
      existsSync: (path) =>
        path === 'C:\\Users\\WON2\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
    })

    expect(launcher.getStatus()).toEqual(
      expect.objectContaining({
        chromeAvailable: true,
        chromePath: 'C:\\Users\\WON2\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
        chromeProfilePath: 'C:\\Users\\WON2\\AppData\\Roaming\\delivery-menu-sync\\managed-chrome',
        passwordManagerLoginReady: true,
        managedChromeRunning: false,
        chromeError: null
      })
    )
  })

  it('does not mark Chromium as ready for the Google Chrome password manager flow', () => {
    const launcher = new ManagedChromeLauncher({
      extensionPath: 'C:\\dev\\bedal\\browser-extension\\delivery-menu-inspector',
      profileDir: 'C:\\Users\\WON2\\AppData\\Roaming\\delivery-menu-sync\\managed-chrome',
      chromeCandidates: ['C:\\Chromium\\Application\\chrome.exe'],
      existsSync: () => true
    })

    expect(launcher.getStatus().passwordManagerLoginReady).toBe(false)
  })

  it('launches chrome with extension and dedicated profile flags', () => {
    const child = {
      exitCode: null,
      killed: false,
      once: vi.fn(),
      unref: vi.fn()
    }
    const spawn = vi.fn().mockReturnValue(child)
    const mkdirSync = vi.fn()
    const launcher = new ManagedChromeLauncher({
      extensionPath: 'C:\\dev\\bedal\\browser-extension\\delivery-menu-inspector',
      profileDir: 'C:\\Users\\WON2\\AppData\\Roaming\\delivery-menu-sync\\managed-chrome',
      chromeCandidates: ['C:\\chrome.exe'],
      existsSync: () => true,
      mkdirSync,
      spawn
    })

    const status = launcher.launch(
      'https://store.coupangeats.com/merchant/management/menu/109935/options'
    )

    expect(mkdirSync).toHaveBeenCalledWith(
      'C:\\Users\\WON2\\AppData\\Roaming\\delivery-menu-sync\\managed-chrome',
      { recursive: true }
    )
    expect(spawn).toHaveBeenCalledWith(
      'C:\\chrome.exe',
      expect.arrayContaining([
        '--user-data-dir=C:\\Users\\WON2\\AppData\\Roaming\\delivery-menu-sync\\managed-chrome',
        '--load-extension=C:\\dev\\bedal\\browser-extension\\delivery-menu-inspector',
        '--disable-extensions-except=C:\\dev\\bedal\\browser-extension\\delivery-menu-inspector',
        '--remote-debugging-port=39482',
        '--window-size=1480,1000',
        '--window-position=48,48',
        '--new-window',
        'https://store.coupangeats.com/merchant/management/menu/109935/options'
      ]),
      {
        detached: true,
        stdio: 'ignore'
      }
    )
    expect(child.unref).toHaveBeenCalledTimes(1)
    expect(status).toEqual(
      expect.objectContaining({
        chromeAvailable: true,
        managedChromeRunning: true,
        lastLaunchUrl: 'https://store.coupangeats.com/merchant/management/menu/109935/options',
        chromeError: null
      })
    )
  })

  it('returns a friendly status when chrome is not installed', () => {
    const launcher = new ManagedChromeLauncher({
      extensionPath: 'C:\\dev\\bedal\\browser-extension\\delivery-menu-inspector',
      profileDir: 'C:\\Users\\WON2\\AppData\\Roaming\\delivery-menu-sync\\managed-chrome',
      chromeCandidates: ['C:\\chrome.exe'],
      existsSync: () => false
    })

    const status = launcher.launch('https://store.coupangeats.com/merchant/management/menu/109935')

    expect(status).toEqual(
      expect.objectContaining({
        chromeAvailable: false,
        chromePath: null,
        managedChromeRunning: false,
        chromeError: '크롬 실행 파일을 찾지 못했습니다.'
      })
    )
  })
})

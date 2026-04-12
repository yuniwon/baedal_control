import type { PlatformCode } from '../../../shared/contracts'
import type { PlatformAdapter, PlatformMenuSnapshot } from './types'

export class FakeAdapter implements PlatformAdapter {
  constructor(
    public readonly platformCode: PlatformCode,
    private readonly menus: PlatformMenuSnapshot[] = []
  ) {}

  async fetchMenus() {
    return this.menus
  }

  async applyMenuUpdate() {
    return
  }
}

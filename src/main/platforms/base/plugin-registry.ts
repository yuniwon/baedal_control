import type { PlatformCode } from '../../../shared/platforms'
import type { PlatformPlugin } from './plugin'

export class PlatformPluginRegistry {
  private readonly plugins = new Map<PlatformCode, PlatformPlugin>()

  register(plugin: PlatformPlugin) {
    const platformCode = plugin.metadata.code
    if (this.plugins.has(platformCode)) {
      throw new Error(`platform_plugin_duplicate:${platformCode}`)
    }
    this.plugins.set(platformCode, plugin)
  }

  replace(plugin: PlatformPlugin) {
    const platformCode = plugin.metadata.code
    if (!this.plugins.has(platformCode)) {
      throw new Error(`platform_plugin_missing:${platformCode}`)
    }
    this.plugins.set(platformCode, plugin)
  }

  get(platformCode: PlatformCode) {
    const plugin = this.plugins.get(platformCode)
    if (!plugin) {
      throw new Error(`platform_plugin_missing:${platformCode}`)
    }
    return plugin
  }

  getReader(platformCode: PlatformCode) {
    const plugin = this.get(platformCode)
    if (!plugin.capabilities.operations.read || !plugin.reader) {
      throw new Error(`platform_read_unavailable:${platformCode}`)
    }
    return plugin.reader
  }

  getWriter(platformCode: PlatformCode) {
    const plugin = this.get(platformCode)
    if (!plugin.capabilities.operations.write || !plugin.writer) {
      throw new Error(`platform_write_unavailable:${platformCode}`)
    }
    return plugin.writer
  }

  getCreator(platformCode: PlatformCode) {
    const plugin = this.get(platformCode)
    if (plugin.capabilities.catalog.menuCreation !== 'verified' || !plugin.creator) {
      throw new Error(`platform_menu_creation_unavailable:${platformCode}`)
    }
    return plugin.creator
  }
}

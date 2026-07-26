import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { z } from 'zod'
import type {
  BrowserInspectionApiEvent,
  BrowserInspectionField,
  BrowserInspectionSnapshot,
  BrowserInspectorStatus,
  PlatformCode
} from '../../shared/contracts'
import { PLATFORM_CODES } from '../../shared/platforms'

const browserInspectionFieldSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
  source: z.enum(['dom', 'input', 'button', 'text', 'api'])
})

const browserInspectionApiEventSchema = z.object({
  url: z.string().url(),
  method: z.string().min(1),
  status: z.number().int().nullable().optional(),
  capturedAt: z.string().min(1),
  requestPreview: z.string().nullable().optional(),
  responsePreview: z.string().nullable().optional()
})

export const browserInspectionSnapshotSchema = z.object({
  snapshotId: z.string().min(1),
  platformCode: z.enum(PLATFORM_CODES),
  source: z.enum(['browser_extension', 'manual_browser']),
  pageUrl: z.string().url(),
  pageTitle: z.string().min(1),
  pageKind: z.enum(['menu_list', 'option_list', 'menu_detail', 'unknown']).optional(),
  captureMode: z.enum(['viewport', 'full_scroll']).optional(),
  host: z.string().min(1),
  capturedAt: z.string().min(1),
  textSnippet: z.string().nullable().optional(),
  menuNames: z.array(z.string()),
  menuItems: z
    .array(
      z.object({
        name: z.string().min(1),
        priceText: z.string().nullable().optional(),
        categoryName: z.string().nullable().optional()
      })
    )
    .optional(),
  optionGroupNames: z.array(z.string()),
  buttonLabels: z.array(z.string()),
  inputHints: z.array(z.string()),
  fields: z.array(browserInspectionFieldSchema),
  apiEvents: z.array(browserInspectionApiEventSchema),
  screenshotDataUrl: z.string().nullable().optional(),
  visiblePasswordInputCount: z.number().int().nonnegative().default(0),
  loginMarkerDetected: z.boolean().default(false),
  logoutMarkerDetected: z.boolean().default(false),
  managementMarkerDetected: z.boolean().default(false)
})

interface BrowserInspectionSnapshotRepositoryLike {
  save: (snapshot: BrowserInspectionSnapshot) => void
}

interface BrowserInspectorBridgeOptions {
  extensionPath: string
  host?: string
  port?: number
}

const jsonHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
}

const readRequestBody = async (request: IncomingMessage, maxBytes = 10 * 1024 * 1024) =>
  new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalLength = 0

    request.on('data', (chunk) => {
      const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
      totalLength += bufferChunk.length

      if (totalLength > maxBytes) {
        reject(new Error('payload_too_large'))
        request.destroy()
        return
      }

      chunks.push(bufferChunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })

const writeJson = (response: ServerResponse, statusCode: number, payload: unknown) => {
  response.writeHead(statusCode, jsonHeaders)
  response.end(JSON.stringify(payload))
}

export class BrowserInspectorBridge {
  private server?: Server
  private readonly host: string
  private readonly port: number

  constructor(
    private readonly repository: BrowserInspectionSnapshotRepositoryLike,
    options: BrowserInspectorBridgeOptions
  ) {
    this.host = options.host ?? '127.0.0.1'
    this.port = options.port ?? 39481
    this.extensionPath = options.extensionPath
  }

  readonly extensionPath: string

  async start() {
    if (this.server?.listening) {
      return
    }

    const server = createServer((request, response) => {
      void this.handleRequest(request, response)
    })

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(this.port, this.host, () => {
        server.off('error', reject)
        resolve()
      })
    })

    this.server = server
  }

  async stop() {
    if (!this.server) {
      return
    }

    const closingServer = this.server
    this.server = undefined

    await new Promise<void>((resolve, reject) => {
      closingServer.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
  }

  getStatus(): BrowserInspectorStatus {
    return {
      receiverUrl: this.receiverUrl,
      extensionPath: this.extensionPath,
      isRunning: Boolean(this.server?.listening)
    }
  }

  private get receiverUrl() {
    return `http://${this.host}:${this.port}/inspection-snapshots`
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse) {
    if (!request.url) {
      writeJson(response, 404, { ok: false, error: 'not_found' })
      return
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(204, jsonHeaders)
      response.end()
      return
    }

    if (request.method === 'GET' && request.url === '/health') {
      writeJson(response, 200, { ok: true, receiverUrl: this.receiverUrl })
      return
    }

    if (request.method === 'POST' && request.url === '/inspection-snapshots') {
      try {
        const rawBody = await readRequestBody(request)
        const parsedPayload = browserInspectionSnapshotSchema.parse(JSON.parse(rawBody))

        this.repository.save({
          snapshotId: parsedPayload.snapshotId,
          platformCode: parsedPayload.platformCode as PlatformCode,
          source: parsedPayload.source,
          pageUrl: parsedPayload.pageUrl,
          pageTitle: parsedPayload.pageTitle,
          pageKind: parsedPayload.pageKind ?? 'unknown',
          captureMode: parsedPayload.captureMode ?? 'viewport',
          host: parsedPayload.host,
          capturedAt: parsedPayload.capturedAt,
          textSnippet: parsedPayload.textSnippet ?? null,
          menuNames: parsedPayload.menuNames,
          menuItems:
            parsedPayload.menuItems?.map((item) => ({
              name: item.name,
              priceText: item.priceText ?? null,
              categoryName: item.categoryName ?? null
            })) ?? [],
          optionGroupNames: parsedPayload.optionGroupNames,
          buttonLabels: parsedPayload.buttonLabels,
          inputHints: parsedPayload.inputHints,
          fields: parsedPayload.fields as BrowserInspectionField[],
          apiEvents: parsedPayload.apiEvents as BrowserInspectionApiEvent[],
          screenshotDataUrl: parsedPayload.screenshotDataUrl ?? null,
          visiblePasswordInputCount: parsedPayload.visiblePasswordInputCount,
          loginMarkerDetected: parsedPayload.loginMarkerDetected,
          logoutMarkerDetected: parsedPayload.logoutMarkerDetected,
          managementMarkerDetected: parsedPayload.managementMarkerDetected
        })

        writeJson(response, 200, { ok: true, snapshotId: parsedPayload.snapshotId })
        return
      } catch (error) {
        writeJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : 'invalid_payload'
        })
        return
      }
    }

    writeJson(response, 404, { ok: false, error: 'not_found' })
  }
}

import { promises as fs } from 'fs'
import { resolve, dirname, extname, relative, join } from 'path'
import { fileURLToPath } from 'url'

// 获取当前文件的目录路径
export const __dirname = dirname(fileURLToPath(import.meta.url))

// 路径工具函数
export function normalizePath(id: string): string {
  return id.replace(/\\/g, '/')
}

export function isAbsolute(path: string): boolean {
  return path.startsWith('/') || /^[a-zA-Z]:/.test(path)
}

export function cleanUrl(url: string): string {
  return url.replace(/[?#].*$/, '')
}

export function removeTimestampQuery(url: string): string {
  return url.replace(/\bt=\d{13}&?\b/, '').replace(/[?&]$/, '')
}

// 文件系统工具
export async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      throw error
    }
  }
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

export async function readFile(path: string): Promise<string> {
  return fs.readFile(path, 'utf-8')
}

export async function writeFile(path: string, content: string): Promise<void> {
  await ensureDir(dirname(path))
  await fs.writeFile(path, content, 'utf-8')
}

// 模块解析工具
export function isJSRequest(url: string): boolean {
  const cleanedUrl = cleanUrl(url)
  if (
    cleanedUrl.endsWith('.js') ||
    cleanedUrl.endsWith('.ts') ||
    cleanedUrl.endsWith('.jsx') ||
    cleanedUrl.endsWith('.tsx')
  ) {
    return true
  }
  // 检查是否为裸模块导入
  return !cleanedUrl.includes('.')
}

export function isCSSRequest(url: string): boolean {
  return cleanUrl(url).endsWith('.css')
}

export function isImportRequest(url: string): boolean {
  return url.endsWith('?import')
}

export function isStaticAsset(id: string): boolean {
  const ext = extname(cleanUrl(id))
  return ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.avif'].includes(ext)
}

// 时间戳工具
export function getTimestamp(): number {
  return Date.now()
}

// 错误处理工具
export class BuildError extends Error {
  constructor(message: string, public code?: string, public loc?: any) {
    super(message)
    this.name = 'BuildError'
  }
}

export function createDebugger(namespace: string) {
  return (message: string, ...args: any[]) => {
    if (process.env.DEBUG?.includes(namespace) || process.env.DEBUG === '*') {
      console.log(`[${namespace}] ${message}`, ...args)
    }
  }
}

// 颜色输出工具
export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
}

export function colorize(color: keyof typeof colors, text: string): string {
  return `${colors[color]}${text}${colors.reset}`
}

// 性能计时工具
export class Timer {
  private startTime: number

  constructor() {
    this.startTime = performance.now()
  }

  stop(): number {
    return performance.now() - this.startTime
  }

  stopAndLog(label: string): void {
    const time = this.stop()
    console.log(`${label}: ${time.toFixed(2)}ms`)
  }
}

// 深度合并对象
export function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target }

  for (const key in source) {
    const sourceValue = source[key]
    const targetValue = result[key]

    if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
      if (targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue)) {
        result[key] = deepMerge(targetValue, sourceValue) as any
      } else {
        result[key] = sourceValue as any
      }
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as any
    }
  }

  return result
}

// 获取空闲端口
export async function getPort(preferredPort: number): Promise<number> {
  const { createServer } = await import('net')

  return new Promise((resolve, reject) => {
    const server = createServer()

    server.listen(preferredPort, () => {
      const port = (server.address() as any)?.port
      server.close(() => resolve(port))
    })

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        // 端口被占用，尝试下一个端口
        resolve(getPort(preferredPort + 1))
      } else {
        reject(err)
      }
    })
  })
}

import { Server } from 'http'
import { WebSocketServer } from 'ws'

// 核心配置接口
export interface MiniViteConfig {
  root?: string
  base?: string
  publicDir?: string
  build?: BuildOptions
  server?: ServerOptions
  plugins?: Plugin[]
  optimizeDeps?: OptimizeDepsOptions
}

// 构建选项
export interface BuildOptions {
  outDir: string
  assetsDir: string
  sourcemap?: boolean | 'inline' | 'hidden'
  minify?: boolean | 'terser' | 'esbuild'
  target?: string | string[]
  rollupOptions?: any
}

// 服务器选项
export interface ServerOptions {
  host?: string | boolean
  port?: number
  https?: boolean
  open?: boolean | string
  cors?: boolean
  hmr?: boolean | HMROptions
}

// HMR 选项
export interface HMROptions {
  port?: number
  host?: string
  clientPort?: number
}

// 依赖优化选项
export interface OptimizeDepsOptions {
  entries: string[]
  exclude: string[]
  include: string[]
  esbuildOptions?: any
}

// 插件接口
export interface Plugin {
  name: string
  configResolved?: (config: ResolvedConfig) => void | Promise<void>
  buildStart?: (opts: any) => void | Promise<void>
  resolveId?: (id: string, importer?: string) => string | null | Promise<string | null>
  load?: (id: string) => string | null | Promise<string | null>
  transform?: (code: string, id: string) => TransformResult | null | Promise<TransformResult | null>
  generateBundle?: (opts: any, bundle: any) => void | Promise<void>
  writeBundle?: (opts: any, bundle: any) => void | Promise<void>
  configureServer?: (server: DevServer) => void | Promise<void>
  handleHotUpdate?: (ctx: HmrContext) => void | Promise<void>
}

// 转换结果
export interface TransformResult {
  code: string
  map?: string | null
}

// 解析后的配置
export interface ResolvedConfig extends Required<MiniViteConfig> {
  command: 'build' | 'serve'
  mode: string
  isProduction: boolean
  env: Record<string, any>
  logger: Logger
}

// 开发服务器
export interface DevServer {
  config: ResolvedConfig
  middlewares: any
  httpServer: Server | null
  ws: WebSocketServer
  moduleGraph: ModuleGraph
  transformRequest: (url: string, options?: TransformOptions) => Promise<TransformResult | null>
  listen: (port?: number, isRestart?: boolean) => Promise<DevServer>
  close: () => Promise<void>
}

// 模块图
export interface ModuleNode {
  id: string
  file: string | null
  importers: Set<ModuleNode>
  importedModules: Set<ModuleNode>
  acceptedHmrDeps: Set<ModuleNode>
  isSelfAccepting: boolean
  transformResult: TransformResult | null
  ssrTransformResult: TransformResult | null
  lastHMRTimestamp: number
}

export interface ModuleGraph {
  urlToModuleMap: Map<string, ModuleNode>
  idToModuleMap: Map<string, ModuleNode>
  fileToModulesMap: Map<string, Set<ModuleNode>>
  safeModulesPath: Set<string>

  getModuleByUrl: (rawUrl: string) => ModuleNode | undefined
  getModuleById: (id: string) => ModuleNode | undefined
  getModulesByFile: (file: string) => Set<ModuleNode> | undefined
  onFileChange: (file: string) => void
  invalidateModule: (mod: ModuleNode) => void
  invalidateAll: () => void
  updateModuleInfo: (mod: ModuleNode, importedModules: Set<string | ModuleNode>) => void
  ensureEntryFromUrl: (rawUrl: string) => ModuleNode
}

// HMR 上下文
export interface HmrContext {
  file: string
  timestamp: number
  modules: Array<ModuleNode>
  read: () => string | Promise<string>
  server: DevServer
}

// 转换选项
export interface TransformOptions {
  ssr?: boolean
}

// 日志接口
export interface Logger {
  info: (msg: string, options?: any) => void
  warn: (msg: string, options?: any) => void
  error: (msg: string, options?: any) => void
  clearScreen: (type: string) => void
}

// HMR 更新类型
export interface Update {
  type: 'js-update' | 'css-update'
  path: string
  acceptedPath: string
  timestamp: number
}

// HMR 载荷
export interface HMRPayload {
  type: string
  updates?: Update[]
  path?: string
  message?: string
}

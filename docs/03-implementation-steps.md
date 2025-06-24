# 分步骤实现过程

## 🏁 项目初始化和环境搭建

### 第一步：创建项目结构

```bash
# 创建项目目录
mkdir mini-vite
cd mini-vite

# 初始化 npm 项目
npm init -y

# 创建基础目录结构
mkdir -p src/{core,dev-server,build,plugins,deps,preview,types,utils}
mkdir -p bin examples docs
```

### 第二步：配置 TypeScript

**安装依赖**
```bash
# 核心依赖
npm install chokidar esbuild rollup ws mime-types magic-string es-module-lexer connect sirv commander

# 开发依赖
npm install -D typescript @types/node @types/ws @types/mime-types @types/connect jest @types/jest
```

**配置 tsconfig.json**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "allowJs": true,
    "strict": true,
    "noEmit": false,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**配置 package.json**
```json
{
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "mini-vite": "./bin/mini-vite.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "jest"
  }
}
```

### 第三步：创建基础类型定义

**src/types/index.ts**
```typescript
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

// 插件接口
export interface Plugin {
  name: string
  configResolved?: (config: ResolvedConfig) => void | Promise<void>
  buildStart?: () => void | Promise<void>
  resolveId?: (id: string, importer?: string) => string | null | Promise<string | null>
  load?: (id: string) => string | null | Promise<string | null>
  transform?: (code: string, id: string) => TransformResult | null | Promise<TransformResult | null>
  configureServer?: (server: DevServer) => void | Promise<void>
  handleHotUpdate?: (ctx: HmrContext) => void | Promise<void>
}

// 其他类型定义...
```

## 🧱 核心模块逐步实现

### 第四步：实现配置系统

**src/core/config.ts**
```typescript
import { resolve } from 'path'
import { MiniViteConfig, ResolvedConfig } from '../types/index.js'

// 默认配置
const DEFAULT_CONFIG: MiniViteConfig = {
  root: process.cwd(),
  base: '/',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'esbuild',
    target: 'modules'
  },
  server: {
    host: 'localhost',
    port: 3000,
    https: false,
    open: false,
    cors: true,
    hmr: true
  },
  plugins: [],
  optimizeDeps: {
    entries: ['index.html'],
    exclude: [],
    include: []
  }
}

export async function resolveConfig(
  inlineConfig: MiniViteConfig = {},
  command: 'build' | 'serve' = 'serve',
  mode = 'development'
): Promise<ResolvedConfig> {
  // 配置解析逻辑
  const root = resolve(inlineConfig.root || process.cwd())
  
  // 查找并加载配置文件
  const configFile = await findConfigFile(root)
  let fileConfig: MiniViteConfig = {}
  
  if (configFile) {
    fileConfig = await loadConfigFile(configFile)
  }
  
  // 合并配置
  const mergedConfig = deepMerge(
    deepMerge(DEFAULT_CONFIG, fileConfig),
    inlineConfig
  )
  
  // 构建最终配置
  const resolved: ResolvedConfig = {
    ...mergedConfig,
    command,
    mode,
    isProduction: command === 'build',
    root,
    // ... 其他配置处理
  }
  
  return resolved
}
```

### 第五步：实现日志系统

**src/core/logger.ts**
```typescript
import { Logger } from '../types/index.js'

export function createLogger(level = 'info'): Logger {
  function output(type: 'info' | 'warn' | 'error', msg: string) {
    const timestamp = new Date().toLocaleTimeString()
    const prefix = `${timestamp} [mini-vite]`
    
    switch (type) {
      case 'info':
        console.log(`${prefix} ${msg}`)
        break
      case 'warn':
        console.warn(`${prefix} warning: ${msg}`)
        break
      case 'error':
        console.error(`${prefix} error: ${msg}`)
        break
    }
  }
  
  return {
    info: (msg: string) => output('info', msg),
    warn: (msg: string) => output('warn', msg),
    error: (msg: string) => output('error', msg),
    clearScreen: () => console.clear()
  }
}
```

### 第六步：实现模块图

**src/core/moduleGraph.ts**
```typescript
import { ModuleGraph, ModuleNode } from '../types/index.js'

export class ModuleNodeImpl implements ModuleNode {
  id: string
  file: string | null = null
  importers = new Set<ModuleNode>()
  importedModules = new Set<ModuleNode>()
  acceptedHmrDeps = new Set<ModuleNode>()
  isSelfAccepting = false
  transformResult: any = null
  lastHMRTimestamp = 0

  constructor(id: string) {
    this.id = id
  }
}

export class ModuleGraphImpl implements ModuleGraph {
  urlToModuleMap = new Map<string, ModuleNode>()
  idToModuleMap = new Map<string, ModuleNode>()
  fileToModulesMap = new Map<string, Set<ModuleNode>>()

  getModuleByUrl(rawUrl: string): ModuleNode | undefined {
    const url = cleanUrl(rawUrl)
    return this.urlToModuleMap.get(url)
  }

  onFileChange(file: string): void {
    const mods = this.getModulesByFile(file)
    if (mods) {
      const timestamp = Date.now()
      mods.forEach(mod => {
        this.invalidateModule(mod)
        mod.lastHMRTimestamp = timestamp
      })
    }
  }

  invalidateModule(mod: ModuleNode): void {
    mod.transformResult = null
    // 递归失效依赖此模块的模块
    mod.importers.forEach(importer => {
      if (!importer.acceptedHmrDeps.has(mod)) {
        this.invalidateModule(importer)
      }
    })
  }
}
```

## 🔗 功能集成和测试

### 第七步：实现插件系统

**src/dev-server/pluginContainer.ts**
```typescript
import { Plugin, ResolvedConfig, ModuleGraph } from '../types/index.js'

export class PluginContainer {
  private plugins: Plugin[]
  
  constructor(
    private config: ResolvedConfig,
    private moduleGraph: ModuleGraph
  ) {
    this.plugins = config.plugins
  }

  async resolveId(id: string, importer?: string): Promise<string | null> {
    for (const plugin of this.plugins) {
      if (plugin.resolveId) {
        const result = await plugin.resolveId(id, importer)
        if (result) return result
      }
    }
    return null
  }

  async load(id: string): Promise<string | null> {
    for (const plugin of this.plugins) {
      if (plugin.load) {
        const result = await plugin.load(id)
        if (result) return result
      }
    }
    return null
  }

  async transform(code: string, id: string): Promise<TransformResult | null> {
    let result = { code, map: null }
    
    for (const plugin of this.plugins) {
      if (plugin.transform) {
        const transformResult = await plugin.transform(result.code, id)
        if (transformResult) {
          result = transformResult
        }
      }
    }
    
    return result
  }
}
```

### 第八步：实现内置插件

**src/plugins/esbuild.ts**
```typescript
import { transform } from 'esbuild'
import { Plugin } from '../types/index.js'

export function esbuildPlugin(): Plugin {
  return {
    name: 'esbuild',
    async transform(code: string, id: string) {
      if (!/\.(tsx?|jsx?)$/.test(id)) return null
      
      try {
        const result = await transform(code, {
          loader: id.endsWith('.tsx') ? 'tsx' : 
                 id.endsWith('.ts') ? 'ts' :
                 id.endsWith('.jsx') ? 'jsx' : 'js',
          target: 'es2020',
          format: 'esm',
          sourcemap: true
        })
        
        return {
          code: result.code,
          map: result.map
        }
      } catch (error) {
        throw new Error(`esbuild transform failed: ${error.message}`)
      }
    }
  }
}
```

**src/plugins/css.ts**
```typescript
import { Plugin } from '../types/index.js'

export function cssPlugin(): Plugin {
  return {
    name: 'css',
    async transform(code: string, id: string) {
      if (!id.endsWith('.css')) return null
      
      // 将 CSS 转换为 JS 模块
      const cssCode = `
const css = ${JSON.stringify(code)}
const style = document.createElement('style')
style.textContent = css
document.head.appendChild(style)
export default css
`
      
      return {
        code: cssCode,
        map: null
      }
    }
  }
}
```

### 第九步：实现开发服务器

**src/dev-server/index.ts**
```typescript
import connect from 'connect'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { ResolvedConfig, DevServer } from '../types/index.js'
import { ModuleGraphImpl } from '../core/moduleGraph.js'
import { PluginContainer } from './pluginContainer.js'

export async function createDevServer(config: ResolvedConfig): Promise<DevServer> {
  const middlewares = connect()
  const moduleGraph = new ModuleGraphImpl()
  const pluginContainer = new PluginContainer(config, moduleGraph)
  
  // 创建 WebSocket 服务器用于 HMR
  const ws = new WebSocketServer({ port: 3001 })
  
  // 添加中间件
  middlewares.use(async (req, res, next) => {
    const url = req.url!
    
    // 处理模块请求
    if (url.startsWith('/@modules/') || url.endsWith('.js') || url.endsWith('.ts')) {
      try {
        const result = await transformRequest(url, pluginContainer, moduleGraph)
        res.setHeader('Content-Type', 'application/javascript')
        res.end(result.code)
      } catch (error) {
        res.statusCode = 500
        res.end(error.message)
      }
    } else {
      next()
    }
  })
  
  const server: DevServer = {
    config,
    middlewares,
    ws,
    moduleGraph,
    
    async listen(port = 3000) {
      const httpServer = createServer(middlewares)
      
      return new Promise((resolve) => {
        httpServer.listen(port, () => {
          config.logger.info(`Dev server running at http://localhost:${port}`)
          resolve(server)
        })
      })
    },
    
    async close() {
      ws.close()
    }
  }
  
  return server
}

async function transformRequest(
  url: string,
  pluginContainer: PluginContainer,
  moduleGraph: ModuleGraph
) {
  // 解析模块 ID
  const id = await pluginContainer.resolveId(url)
  if (!id) throw new Error(`Cannot resolve module: ${url}`)
  
  // 加载模块内容
  const loadResult = await pluginContainer.load(id)
  if (!loadResult) throw new Error(`Cannot load module: ${id}`)
  
  // 转换模块
  const transformResult = await pluginContainer.transform(loadResult, id)
  
  return transformResult || { code: loadResult, map: null }
}
```

### 第十步：实现热更新系统

**src/dev-server/hmr.ts**
```typescript
import chokidar from 'chokidar'
import { WebSocketServer } from 'ws'
import { DevServer } from '../types/index.js'

export function createHMRServer(port: number) {
  const ws = new WebSocketServer({ port })
  
  function handleConnection(socket: any, server: DevServer) {
    // 文件监听
    const watcher = chokidar.watch(server.config.root, {
      ignored: ['**/node_modules/**', '**/.git/**'],
      ignoreInitial: true
    })
    
    watcher.on('change', async (file) => {
      server.config.logger.info(`File changed: ${file}`)
      
      // 更新模块图
      server.moduleGraph.onFileChange(file)
      
      // 发送热更新消息
      socket.send(JSON.stringify({
        type: 'update',
        updates: [{
          type: 'js-update',
          path: file,
          timestamp: Date.now()
        }]
      }))
    })
    
    socket.on('close', () => {
      watcher.close()
    })
  }
  
  return { ws, handleConnection }
}
```

## 📦 打包和发布准备

### 第十一步：实现构建系统

**src/build/index.ts**
```typescript
import { rollup } from 'rollup'
import { ResolvedConfig } from '../types/index.js'

export async function build(config: ResolvedConfig) {
  config.logger.info('Building for production...')
  
  try {
    // 创建 Rollup 构建
    const bundle = await rollup({
      input: 'src/main.js', // 入口文件
      plugins: [
        // Rollup 插件
      ]
    })
    
    // 生成输出
    await bundle.write({
      dir: config.build.outDir,
      format: 'es',
      sourcemap: config.build.sourcemap
    })
    
    config.logger.info('Build completed!')
  } catch (error) {
    config.logger.error(`Build failed: ${error.message}`)
    throw error
  }
}
```

### 第十二步：创建 CLI 工具

**bin/mini-vite.js**
```javascript
#!/usr/bin/env node

import { program } from 'commander'
import { createDevServer, build, resolveConfig } from '../dist/index.js'

program
  .command('dev')
  .description('Start development server')
  .option('-p, --port <port>', 'Port number', '3000')
  .option('-h, --host <host>', 'Host name', 'localhost')
  .action(async (options) => {
    const config = await resolveConfig({
      server: {
        port: parseInt(options.port),
        host: options.host
      }
    }, 'serve')
    
    const server = await createDevServer(config)
    await server.listen()
  })

program
  .command('build')
  .description('Build for production')
  .action(async () => {
    const config = await resolveConfig({}, 'build')
    await build(config)
  })

program.parse()
```

### 第十三步：添加测试

**tests/config.test.ts**
```typescript
import { resolveConfig } from '../src/core/config'

describe('Config Resolution', () => {
  test('should resolve default config', async () => {
    const config = await resolveConfig()
    
    expect(config.root).toBeDefined()
    expect(config.base).toBe('/')
    expect(config.server.port).toBe(3000)
  })
  
  test('should merge inline config', async () => {
    const config = await resolveConfig({
      server: { port: 4000 }
    })
    
    expect(config.server.port).toBe(4000)
  })
})
```

### 第十四步：完善文档

**创建示例项目**
```bash
mkdir examples/basic
cd examples/basic

# 创建示例文件
echo '<div id="app"></div>' > index.html
echo 'console.log("Hello Mini Vite!")' > main.js
```

**更新 README.md**
```markdown
# Mini Vite

A lightweight Vite-like build tool.

## Quick Start

```bash
npm install -g mini-vite
mini-vite dev
```

## Features

- Fast development server
- Hot Module Replacement
- TypeScript support
- Plugin system
```

## 🎯 实现检查清单

### 核心功能 ✅
- [ ] 项目初始化和配置
- [ ] TypeScript 环境搭建
- [ ] 核心类型定义
- [ ] 配置系统实现
- [ ] 日志系统实现
- [ ] 模块图实现

### 开发服务器 ✅
- [ ] 基础服务器框架
- [ ] 插件容器实现
- [ ] 内置插件开发
- [ ] 中间件系统
- [ ] 模块转换流程

### 热更新系统 ✅
- [ ] WebSocket 服务器
- [ ] 文件监听机制
- [ ] 更新消息推送
- [ ] 客户端集成

### 构建系统 ✅
- [ ] Rollup 集成
- [ ] 生产构建流程
- [ ] 资源优化处理
- [ ] 输出文件生成

### 工具和测试 ✅
- [ ] CLI 工具开发
- [ ] 单元测试编写
- [ ] 示例项目创建
- [ ] 文档完善

## 🚀 下一步

完成基础实现后，您可以：

1. **[深入学习技术原理](./04-technical-deep-dive.md)** - 理解核心机制
2. **[解决实际问题](./05-challenges-solutions.md)** - 处理开发中的挑战
3. **[优化和扩展](./06-best-practices.md)** - 提升代码质量

让我们继续深入探索这些技术细节！🔍

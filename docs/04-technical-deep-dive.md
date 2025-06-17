# 4. 关键技术点深入解析

## 4.1 ES 模块处理机制

### ES 模块的工作原理

**传统打包 vs ES 模块**：
```javascript
// 传统打包方式：所有模块打包成一个文件
// bundle.js 包含所有依赖

// ES 模块方式：按需加载
import { createCounter } from './counter.js'  // 浏览器原生支持
import './style.css'  // 需要转换处理
```

### 模块解析流程

```
浏览器请求 → 服务器拦截 → 模块解析 → 代码转换 → 返回结果
```

**核心实现**：
```typescript
async function transformRequest(url: string): Promise<TransformResult | null> {
  const cleanedUrl = url.split('?')[0]
  let mod = moduleGraph.getModuleByUrl(cleanedUrl)
  
  if (!mod) {
    mod = moduleGraph.ensureEntryFromUrl(cleanedUrl)
  }
  
  // 检查缓存
  if (mod.transformResult) {
    return mod.transformResult
  }
  
  // 解析模块 ID
  const resolved = await pluginContainer.resolveId(cleanedUrl)
  const id = resolved?.id || cleanedUrl
  
  // 加载模块内容
  const loadResult = await pluginContainer.load(id)
  if (!loadResult) {
    return null
  }
  
  const code = typeof loadResult === 'string' ? loadResult : loadResult.code
  
  // 转换模块代码
  const transformResult = await pluginContainer.transform(code, id)
  
  if (transformResult) {
    mod.transformResult = transformResult
    return transformResult
  }
  
  return { code, map: null }
}
```

### 导入重写机制

**裸模块导入处理**：
```typescript
// 原始代码
import lodash from 'lodash'

// 重写后
import lodash from '/node_modules/.mini-vite/deps/lodash.js'
```

**实现原理**：
```typescript
export function importAnalysisPlugin(): Plugin {
  return {
    name: 'import-analysis',
    async transform(code: string, id: string) {
      if (!isJSRequest(id)) return null
      
      const { init, parse } = await import('es-module-lexer')
      await init
      
      const [imports] = parse(code)
      let s: any
      
      for (const imp of imports) {
        const { s: start, e: end, n: specifier } = imp
        
        if (specifier && isBareImport(specifier)) {
          if (!s) {
            const MagicString = (await import('magic-string')).default
            s = new MagicString(code)
          }
          
          // 重写为预构建的依赖路径
          const rewritten = `/node_modules/.mini-vite/deps/${specifier}.js`
          s.overwrite(start, end, `'${rewritten}'`)
        }
      }
      
      if (s) {
        return {
          code: s.toString(),
          map: s.generateMap({ hires: true }),
        }
      }
      
      return null
    }
  }
}
```

## 4.2 HMR（热更新）实现原理

### HMR 架构设计

```
文件变更 → 文件监听器 → 模块图更新 → 影响分析 → WebSocket 通知 → 浏览器更新
```

### 文件监听实现

```typescript
function setupFileWatcher(server: DevServer, send: (payload: HMRPayload) => void) {
  const { config, moduleGraph } = server
  
  const watcher = chokidar.watch([
    config.root + '/**/*',
    '!' + config.root + '/node_modules/**',
    '!' + config.root + '/dist/**',
  ], {
    ignored: ['**/node_modules/**', '**/dist/**'],
    ignoreInitial: true,
  })

  watcher.on('change', async (file) => {
    const normalizedFile = normalizePath(file)
    
    try {
      await handleFileChange(normalizedFile, server, send)
    } catch (error) {
      send({
        type: 'error',
        message: `HMR update failed: ${error}`,
      })
    }
  })
}
```

### 影响分析算法

```typescript
async function handleFileChange(
  file: string,
  server: DevServer,
  send: (payload: HMRPayload) => void
) {
  const { moduleGraph } = server
  const timestamp = Date.now()

  // 更新模块图
  moduleGraph.onFileChange(file)

  // 获取受影响的模块
  const mods = moduleGraph.getModulesByFile(file)
  if (!mods || mods.size === 0) {
    send({ type: 'full-reload' })
    return
  }

  const updates: Update[] = []

  for (const mod of mods) {
    // 检查是否可以热更新
    if (canHotUpdate(mod)) {
      updates.push({
        type: getUpdateType(mod.id),
        path: mod.id,
        acceptedPath: mod.id,
        timestamp,
      })
    } else {
      // 需要全量刷新
      send({ type: 'full-reload' })
      return
    }
  }

  if (updates.length > 0) {
    send({
      type: 'update',
      updates,
    })
  }
}
```

### WebSocket 通信

**服务端实现**：
```typescript
export function createHMRServer(): HMRServer {
  const ws = new WebSocketServer({ port: 3001 })
  const clients = new Set<WebSocket>()

  function send(payload: HMRPayload) {
    const message = JSON.stringify(payload)
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message)
      }
    })
  }

  function handleConnection(socket: WebSocket, server: DevServer) {
    clients.add(socket)
    
    socket.on('close', () => {
      clients.delete(socket)
    })

    // 发送连接确认
    socket.send(JSON.stringify({ type: 'connected' }))
  }

  return { ws, handleConnection, send, close: () => ws.close() }
}
```

**客户端实现**：
```javascript
// HMR 客户端代码
const socket = new WebSocket('ws://localhost:3001')

socket.addEventListener('message', ({ data }) => {
  const payload = JSON.parse(data)
  
  switch (payload.type) {
    case 'update':
      payload.updates.forEach(update => {
        if (update.type === 'js-update') {
          updateModule(update.path, update.timestamp)
        } else if (update.type === 'css-update') {
          updateCSS(update.path, update.timestamp)
        }
      })
      break
      
    case 'full-reload':
      location.reload()
      break
  }
})

function updateModule(path, timestamp) {
  const newUrl = path + '?t=' + timestamp
  import(newUrl).catch(() => location.reload())
}
```

## 4.3 插件系统设计

### 插件容器架构

```typescript
export class PluginContainer {
  private config: ResolvedConfig
  private plugins: Plugin[]

  async resolveId(id: string, importer?: string): Promise<{ id: string } | null> {
    // 处理绝对路径
    if (id.startsWith('/')) {
      const fullPath = resolve(this.config.root, id.slice(1))
      if (await pathExists(fullPath)) {
        return { id: fullPath }
      }
    }

    // 调用插件的 resolveId 钩子
    for (const plugin of this.plugins) {
      if (plugin.resolveId) {
        const result = await plugin.resolveId(id, importer)
        if (result) {
          return { id: result }
        }
      }
    }

    return null
  }

  async load(id: string): Promise<string | { code: string; map?: string } | null> {
    // 调用插件的 load 钩子
    for (const plugin of this.plugins) {
      if (plugin.load) {
        const result = await plugin.load(id)
        if (result !== null) {
          return result
        }
      }
    }

    // 默认文件系统加载
    if (await pathExists(id)) {
      return await readFile(id)
    }

    return null
  }

  async transform(code: string, id: string): Promise<TransformResult | null> {
    let result: TransformResult = { code, map: null }

    // 依次调用插件的 transform 钩子
    for (const plugin of this.plugins) {
      if (plugin.transform) {
        const transformResult = await plugin.transform(result.code, id)
        if (transformResult) {
          result = transformResult
        }
      }
    }

    return result.code !== code ? result : null
  }
}
```

### 内置插件实现

**TypeScript 插件**：
```typescript
export function esbuildPlugin(): Plugin {
  return {
    name: 'esbuild',
    async transform(code: string, id: string) {
      if (!isJSRequest(id)) return null
      
      const ext = extname(id)
      if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) return null
      
      const result = await transform(code, {
        loader: ext.slice(1) as any,
        target: 'es2020',
        format: 'esm',
        sourcemap: true,
        jsx: 'transform',
      })
      
      return {
        code: result.code,
        map: result.map || null,
      }
    }
  }
}
```

**CSS 插件**：
```typescript
export function cssPlugin(): Plugin {
  return {
    name: 'css',
    async load(id: string) {
      if (!isCSSRequest(id)) return null
      return await readFile(id)
    },
    transform(code: string, id: string) {
      if (!isCSSRequest(id)) return null
      
      // 将 CSS 转换为 JS 模块
      const cssCode = JSON.stringify(code)
      const jsCode = `
const css = ${cssCode};
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);
export default css;
`
      
      return { code: jsCode, map: null }
    }
  }
}
```

## 4.4 构建优化策略

### 依赖预构建

**扫描依赖**：
```typescript
private async scanDependencies(): Promise<Set<string>> {
  const deps = new Set<string>()
  const { entries } = this.config.optimizeDeps

  for (const entry of entries) {
    const entryPath = resolve(this.config.root, entry)
    if (await pathExists(entryPath)) {
      await this.scanFile(entryPath, deps)
    }
  }

  return deps
}

private async scanFile(filePath: string, deps: Set<string>): Promise<void> {
  const content = await fs.readFile(filePath, 'utf-8')
  const { init, parse } = await import('es-module-lexer')
  await init
  
  const [imports] = parse(content)
  
  for (const imp of imports) {
    const { n: specifier } = imp
    
    if (specifier && this.isBareImport(specifier)) {
      deps.add(specifier)
    }
  }
}
```

**esbuild 预构建**：
```typescript
private async buildDependencies(deps: Set<string>): Promise<void> {
  const entryPoints: Record<string, string> = {}
  
  for (const dep of deps) {
    try {
      const resolved = require.resolve(dep, { paths: [this.config.root] })
      entryPoints[dep] = resolved
    } catch (error) {
      this.config.logger.warn(`Failed to resolve dependency: ${dep}`)
    }
  }

  await build({
    entryPoints,
    bundle: true,
    format: 'esm',
    target: 'es2020',
    outdir: join(this.cacheDir, 'deps'),
    splitting: true,
    sourcemap: true,
    define: {
      'process.env.NODE_ENV': JSON.stringify(this.config.mode),
    },
  })
}
```

### 生产构建优化

**Rollup 配置**：
```typescript
const bundle = await rollup({
  input,
  plugins: [
    createViteRollupPlugin(pluginContainer),
    ...getRollupPlugins(config),
  ],
  external: (id) => {
    // 外部化 node_modules 依赖
    return id.includes('node_modules')
  },
  treeshake: {
    moduleSideEffects: false,
  },
})
```

**代码分割策略**：
```typescript
const outputOptions: OutputOptions = {
  dir: config.build.outDir,
  format: 'es',
  sourcemap: config.build.sourcemap,
  assetFileNames: join(config.build.assetsDir, '[name]-[hash][extname]'),
  chunkFileNames: join(config.build.assetsDir, '[name]-[hash].js'),
  entryFileNames: join(config.build.assetsDir, '[name]-[hash].js'),
  manualChunks: {
    vendor: ['lodash', 'react', 'vue'], // 第三方库单独打包
  },
}
```

这些技术点的深入理解是掌握现代构建工具的关键，每个部分都体现了性能优化和开发体验的平衡。

# 5. 遇到的挑战和解决方案

## 5.1 TypeScript 类型系统挑战

### 挑战：复杂的插件接口类型定义

**问题描述**：
插件系统需要支持同步和异步操作，返回值类型复杂，需要在类型安全和灵活性之间找到平衡。

**初始方案的问题**：
```typescript
// 过于严格，不够灵活
interface Plugin {
  transform: (code: string, id: string) => TransformResult
}

// 过于宽泛，失去类型安全
interface Plugin {
  transform: (code: string, id: string) => any
}
```

**最终解决方案**：
```typescript
interface Plugin {
  name: string
  transform?: (code: string, id: string) => TransformResult | null | Promise<TransformResult | null>
}

interface TransformResult {
  code: string
  map?: string | null
}
```

**关键改进**：
- 使用联合类型支持同步/异步操作
- 允许返回 `null` 表示插件不处理该文件
- 明确定义返回值结构

### 挑战：模块图的循环引用类型

**问题描述**：
模块图中的节点相互引用，TypeScript 难以处理循环引用的类型定义。

**解决方案**：
```typescript
// 使用接口声明避免循环引用问题
export interface ModuleNode {
  id: string
  file: string | null
  importers: Set<ModuleNode>      // 循环引用
  importedModules: Set<ModuleNode> // 循环引用
  transformResult: TransformResult | null
}

// 实现类分离定义
export class ModuleNodeImpl implements ModuleNode {
  // 具体实现
}
```

## 5.2 异步操作和错误处理

### 挑战：插件链的异步执行

**问题描述**：
插件需要按顺序执行，但每个插件可能是异步的，需要正确处理异步流程和错误传播。

**错误的实现**：
```typescript
// 错误：并发执行，顺序不确定
async transform(code: string, id: string) {
  const promises = this.plugins.map(plugin => 
    plugin.transform?.(code, id)
  )
  const results = await Promise.all(promises)
  // 无法正确链式处理
}
```

**正确的解决方案**：
```typescript
async transform(code: string, id: string): Promise<TransformResult | null> {
  let result: TransformResult = { code, map: null }

  // 顺序执行插件
  for (const plugin of this.plugins) {
    if (plugin.transform) {
      try {
        const transformResult = await plugin.transform(result.code, id)
        if (transformResult) {
          result = transformResult
        }
      } catch (error) {
        this.config.logger.error(`Plugin ${plugin.name} transform error:`, error)
        throw error
      }
    }
  }

  return result.code !== code ? result : null
}
```

### 挑战：文件系统操作的竞态条件

**问题描述**：
多个并发的文件操作可能导致竞态条件，特别是在创建目录和写入文件时。

**解决方案**：
```typescript
// 使用 Map 缓存正在进行的操作
const pendingDirCreations = new Map<string, Promise<void>>()

export async function ensureDir(dir: string): Promise<void> {
  // 检查是否已有正在进行的创建操作
  const pending = pendingDirCreations.get(dir)
  if (pending) {
    return pending
  }

  const promise = (async () => {
    try {
      await fs.mkdir(dir, { recursive: true })
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw error
      }
    } finally {
      pendingDirCreations.delete(dir)
    }
  })()

  pendingDirCreations.set(dir, promise)
  return promise
}
```

## 5.3 模块解析和路径处理

### 挑战：跨平台路径兼容性

**问题描述**：
Windows 和 Unix 系统的路径分隔符不同，需要统一处理。

**解决方案**：
```typescript
export function normalizePath(id: string): string {
  return id.replace(/\\/g, '/')
}

// 在所有路径操作中使用
function resolveModulePath(id: string, importer?: string): string {
  const resolved = importer 
    ? resolve(dirname(importer), id)
    : resolve(id)
  
  return normalizePath(resolved)
}
```

### 挑战：模块 ID 的清理和标准化

**问题描述**：
URL 可能包含查询参数和哈希，需要正确提取模块 ID。

**解决方案**：
```typescript
export function cleanUrl(url: string): string {
  return url.replace(/[?#].*$/, '')
}

export function removeTimestampQuery(url: string): string {
  return url.replace(/\bt=\d{13}&?\b/, '').replace(/[?&]$/, '')
}

// 在模块图中使用
ensureEntryFromUrl(rawUrl: string): ModuleNode {
  const url = cleanUrl(rawUrl)
  // 使用清理后的 URL 作为模块 ID
}
```

## 5.4 HMR 实现的技术难点

### 挑战：WebSocket 连接管理

**问题描述**：
需要处理客户端连接、断开、重连等情况，确保 HMR 的稳定性。

**解决方案**：
```typescript
export function createHMRServer(): HMRServer {
  const ws = new WebSocketServer({ port: 3001 })
  const clients = new Set<WebSocket>()

  function send(payload: HMRPayload) {
    const message = JSON.stringify(payload)
    
    // 清理已断开的连接
    const deadClients = new Set<WebSocket>()
    
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message)
        } catch (error) {
          deadClients.add(client)
        }
      } else {
        deadClients.add(client)
      }
    })
    
    // 移除死连接
    deadClients.forEach(client => clients.delete(client))
  }

  ws.on('connection', (socket) => {
    clients.add(socket)
    
    socket.on('close', () => {
      clients.delete(socket)
    })
    
    socket.on('error', (error) => {
      console.error('WebSocket error:', error)
      clients.delete(socket)
    })
  })

  return { ws, send, close: () => ws.close() }
}
```

### 挑战：模块更新的影响范围计算

**问题描述**：
当一个模块发生变化时，需要准确计算哪些模块需要更新，避免不必要的全量刷新。

**解决方案**：
```typescript
function calculateUpdateScope(changedModule: ModuleNode): {
  shouldFullReload: boolean
  affectedModules: Set<ModuleNode>
} {
  const affectedModules = new Set<ModuleNode>()
  const visited = new Set<ModuleNode>()
  
  function traverse(mod: ModuleNode): boolean {
    if (visited.has(mod)) return false
    visited.add(mod)
    
    // 检查模块是否接受热更新
    if (mod.isSelfAccepting) {
      affectedModules.add(mod)
      return false // 不需要继续向上传播
    }
    
    // 检查是否有接受此模块更新的父模块
    for (const importer of mod.importers) {
      if (importer.acceptedHmrDeps.has(mod)) {
        affectedModules.add(importer)
        return false // 找到接受者，停止传播
      }
      
      // 继续向上传播
      if (traverse(importer)) {
        return true // 需要全量刷新
      }
    }
    
    // 如果没有找到接受者，需要全量刷新
    return mod.importers.size > 0
  }
  
  const shouldFullReload = traverse(changedModule)
  
  return { shouldFullReload, affectedModules }
}
```

## 5.5 构建系统集成问题

### 挑战：Rollup 插件与 Vite 插件的兼容性

**问题描述**：
需要将自定义的插件系统与 Rollup 的插件系统集成。

**解决方案**：
```typescript
function createViteRollupPlugin(pluginContainer: PluginContainer) {
  return {
    name: 'vite:build',
    
    async resolveId(id: string, importer?: string) {
      const result = await pluginContainer.resolveId(id, importer)
      return result?.id || null
    },
    
    async load(id: string) {
      const result = await pluginContainer.load(id)
      return typeof result === 'string' ? result : result?.code || null
    },
    
    async transform(code: string, id: string) {
      const result = await pluginContainer.transform(code, id)
      return result ? { 
        code: result.code, 
        map: result.map 
      } : null
    },
  }
}
```

### 挑战：HTML 入口文件的处理

**问题描述**：
Rollup 默认不支持 HTML 作为入口文件，需要特殊处理。

**解决方案**：
```typescript
async function findEntryPoints(config: ResolvedConfig): Promise<string> {
  // 检查 HTML 文件
  const htmlPath = resolve(config.root, 'index.html')
  if (await pathExists(htmlPath)) {
    // 解析 HTML 中的脚本入口
    const htmlContent = await fs.readFile(htmlPath, 'utf-8')
    const scriptMatch = htmlContent.match(/<script[^>]+src=["']([^"']+)["'][^>]*>/)
    
    if (scriptMatch) {
      const scriptSrc = scriptMatch[1]
      const scriptPath = resolve(config.root, scriptSrc.startsWith('./') ? scriptSrc.slice(2) : scriptSrc)
      
      if (await pathExists(scriptPath)) {
        return scriptPath
      }
    }
  }
  
  // 回退到 JS 入口
  const jsEntries = ['src/main.js', 'src/main.ts', 'src/index.js', 'src/index.ts']
  for (const entry of jsEntries) {
    const entryPath = resolve(config.root, entry)
    if (await pathExists(entryPath)) {
      return entryPath
    }
  }
  
  throw new Error('No entry point found')
}

// 构建后处理 HTML
async function processHTML(config: ResolvedConfig): Promise<void> {
  const htmlPath = resolve(config.root, 'index.html')
  if (!(await pathExists(htmlPath))) return

  let html = await fs.readFile(htmlPath, 'utf-8')
  
  // 查找构建输出的 JS 文件
  const assetsDir = join(config.build.outDir, config.build.assetsDir)
  const jsFiles = await findJSFiles(assetsDir)
  
  // 替换脚本引用
  html = html.replace(
    /<script[^>]+src=["'][^"']+["'][^>]*><\/script>/g,
    ''
  )
  
  const scriptTags = jsFiles
    .map(file => `  <script type="module" src="${config.base}${file}"></script>`)
    .join('\n')
  
  html = html.replace('</body>', `${scriptTags}\n</body>`)
  
  await fs.writeFile(resolve(config.build.outDir, 'index.html'), html)
}
```

## 5.6 调试和错误排查经验

### 调试技巧

1. **使用详细的日志**：
```typescript
const debug = createDebugger('mini-vite:transform')

async function transform(code: string, id: string) {
  debug(`Transforming ${id}`)
  debug(`Input code length: ${code.length}`)
  
  const result = await doTransform(code, id)
  
  debug(`Output code length: ${result.code.length}`)
  return result
}
```

2. **错误上下文信息**：
```typescript
try {
  await transformModule(id)
} catch (error) {
  throw new BuildError(
    `Failed to transform ${id}: ${error.message}`,
    'TRANSFORM_ERROR',
    { file: id, line: error.line, column: error.column }
  )
}
```

3. **性能监控**：
```typescript
class Timer {
  private startTime = performance.now()
  
  stop(): number {
    return performance.now() - this.startTime
  }
  
  stopAndLog(label: string): void {
    const time = this.stop()
    console.log(`${label}: ${time.toFixed(2)}ms`)
  }
}
```

这些挑战和解决方案展示了在构建现代前端工具时需要考虑的各种技术细节，每个问题的解决都体现了工程实践中的权衡和优化思路。

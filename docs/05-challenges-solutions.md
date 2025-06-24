# 遇到的挑战和解决方案

## 🚧 技术难点分析

### 1. ES 模块导入重写

**挑战描述**
浏览器无法直接解析裸模块导入（bare imports），需要将 `import Vue from 'vue'` 重写为可访问的路径。

**问题示例**
```javascript
// 原始代码
import { createApp } from 'vue'
import { router } from 'vue-router'
import utils from './utils'

// 浏览器无法解析 'vue' 和 'vue-router'
```

**解决方案**
```typescript
function rewriteImports(code: string, importer: string): string {
  // 使用 es-module-lexer 解析导入
  const [imports] = parse(code)
  
  let rewrittenCode = code
  let offset = 0
  
  for (const imp of imports) {
    const { s: start, e: end, n: specifier } = imp
    
    if (specifier && !specifier.startsWith('.') && !specifier.startsWith('/')) {
      // 重写裸模块导入
      const rewritten = `/@modules/${specifier}`
      const before = rewrittenCode.slice(0, start + offset)
      const after = rewrittenCode.slice(end + offset)
      
      rewrittenCode = before + rewritten + after
      offset += rewritten.length - specifier.length
    }
  }
  
  return rewrittenCode
}
```

**关键技术点**
- 使用 `es-module-lexer` 精确解析 ES 模块语法
- 保持源码位置信息用于 Source Map
- 处理动态导入 `import()` 语法
- 避免重写注释中的导入语句

### 2. 循环依赖检测和处理

**挑战描述**
模块间的循环依赖可能导致无限递归，需要检测并妥善处理。

**问题示例**
```javascript
// a.js
import { b } from './b.js'
export const a = 'a' + b

// b.js  
import { a } from './a.js'  // 循环依赖
export const b = 'b' + a
```

**解决方案**
```typescript
class ModuleGraphImpl {
  private detectCircularDependency(
    mod: ModuleNode, 
    visited = new Set<ModuleNode>(),
    path = new Set<ModuleNode>()
  ): ModuleNode[] | null {
    
    if (path.has(mod)) {
      // 发现循环依赖，返回循环路径
      return Array.from(path).concat(mod)
    }
    
    if (visited.has(mod)) {
      return null
    }
    
    visited.add(mod)
    path.add(mod)
    
    for (const dep of mod.importedModules) {
      const cycle = this.detectCircularDependency(dep, visited, path)
      if (cycle) return cycle
    }
    
    path.delete(mod)
    return null
  }
  
  addImportedModule(importer: ModuleNode, imported: ModuleNode) {
    importer.importedModules.add(imported)
    imported.importers.add(importer)
    
    // 检查是否产生循环依赖
    const cycle = this.detectCircularDependency(imported)
    if (cycle) {
      this.logger.warn(`Circular dependency detected: ${cycle.map(m => m.id).join(' -> ')}`)
      // 可以选择打断循环或发出警告
    }
  }
}
```

### 3. Source Map 链式合并

**挑战描述**
多个插件依次转换代码时，需要正确合并 Source Map 以保持调试信息。

**问题示例**
```
原始 TypeScript → esbuild 转换 → 导入重写 → CSS 注入
     ↓              ↓              ↓          ↓
   source.ts    →  temp.js    →  rewritten.js → final.js
     ↓              ↓              ↓          ↓
   map1.json   →  map2.json   →  map3.json  → final.map
```

**解决方案**
```typescript
import { SourceMapGenerator, SourceMapConsumer } from 'source-map'

function combineSourceMaps(
  originalMap: string | null,
  newMap: string | null
): string | null {
  if (!originalMap) return newMap
  if (!newMap) return originalMap
  
  const consumer1 = new SourceMapConsumer(JSON.parse(originalMap))
  const consumer2 = new SourceMapConsumer(JSON.parse(newMap))
  const generator = new SourceMapGenerator()
  
  consumer2.eachMapping(mapping => {
    if (mapping.originalLine == null) return
    
    // 查找原始位置
    const original = consumer1.originalPositionFor({
      line: mapping.originalLine,
      column: mapping.originalColumn
    })
    
    if (original.source) {
      generator.addMapping({
        generated: {
          line: mapping.generatedLine,
          column: mapping.generatedColumn
        },
        original: {
          line: original.line!,
          column: original.column!
        },
        source: original.source,
        name: original.name
      })
    }
  })
  
  return generator.toString()
}
```

### 4. 文件监听的性能优化

**挑战描述**
大型项目中文件监听可能消耗大量系统资源，需要优化监听策略。

**问题分析**
- 监听整个项目目录会产生大量无用事件
- 频繁的文件变更可能导致重复处理
- 某些编辑器会产生临时文件干扰

**解决方案**
```typescript
function createOptimizedWatcher(config: ResolvedConfig) {
  const watcher = chokidar.watch(config.root, {
    // 忽略不需要的目录
    ignored: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/.DS_Store',
      '**/Thumbs.db',
      // 编辑器临时文件
      '**/*.tmp',
      '**/*.swp',
      '**/*~'
    ],
    ignoreInitial: true,
    // 防抖设置
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 10
    },
    // 性能优化
    usePolling: false,
    atomic: true
  })
  
  // 防抖处理
  const debouncedHandler = debounce(handleFileChange, 50)
  
  watcher.on('change', debouncedHandler)
  watcher.on('add', debouncedHandler)
  watcher.on('unlink', debouncedHandler)
  
  return watcher
}

function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): T {
  let timeout: NodeJS.Timeout
  
  return ((...args: Parameters<T>) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }) as T
}
```

## 🐛 错误处理经验

### 1. 模块解析失败

**常见错误**
```
Error: Cannot resolve module './component.vue'
Error: Module not found: 'non-existent-package'
```

**解决策略**
```typescript
async function resolveId(id: string, importer?: string): Promise<string | null> {
  try {
    // 1. 尝试标准解析
    const resolved = await standardResolve(id, importer)
    if (resolved) return resolved
    
    // 2. 尝试添加扩展名
    for (const ext of ['.js', '.ts', '.jsx', '.tsx', '.vue']) {
      const withExt = id + ext
      const resolved = await standardResolve(withExt, importer)
      if (resolved) return resolved
    }
    
    // 3. 尝试 index 文件
    for (const indexFile of ['index.js', 'index.ts']) {
      const indexPath = join(id, indexFile)
      const resolved = await standardResolve(indexPath, importer)
      if (resolved) return resolved
    }
    
    return null
  } catch (error) {
    // 提供友好的错误信息
    throw new Error(`Failed to resolve module "${id}" from "${importer}"\n${error.message}`)
  }
}
```

### 2. 转换错误处理

**错误类型**
- 语法错误
- 类型错误
- 插件错误

**处理机制**
```typescript
async function safeTransform(code: string, id: string): Promise<TransformResult> {
  try {
    return await pluginContainer.transform(code, id)
  } catch (error) {
    // 构建详细错误信息
    const errorInfo = {
      id,
      message: error.message,
      stack: error.stack,
      loc: error.loc, // 错误位置
      frame: generateCodeFrame(code, error.loc) // 代码片段
    }
    
    // 在开发模式下发送错误到浏览器
    if (config.command === 'serve') {
      ws.send(JSON.stringify({
        type: 'error',
        err: errorInfo
      }))
    }
    
    throw new BuildError(errorInfo)
  }
}

function generateCodeFrame(source: string, loc?: { line: number, column: number }): string {
  if (!loc) return ''
  
  const lines = source.split('\n')
  const { line, column } = loc
  const start = Math.max(0, line - 3)
  const end = Math.min(lines.length, line + 3)
  
  return lines
    .slice(start, end)
    .map((l, i) => {
      const lineNum = start + i + 1
      const indicator = lineNum === line ? '>' : ' '
      const pointer = lineNum === line ? ' '.repeat(column) + '^' : ''
      return `${indicator} ${lineNum} | ${l}\n${pointer}`
    })
    .join('\n')
}
```

### 3. HMR 连接失败

**问题场景**
- WebSocket 连接被防火墙阻止
- 端口冲突
- 网络代理问题

**解决方案**
```typescript
function createRobustHMRConnection() {
  let ws: WebSocket
  let reconnectAttempts = 0
  const maxReconnectAttempts = 5
  
  function connect() {
    try {
      ws = new WebSocket(`ws://${location.hostname}:3001`)
      
      ws.onopen = () => {
        console.log('[HMR] Connected')
        reconnectAttempts = 0
      }
      
      ws.onclose = () => {
        if (reconnectAttempts < maxReconnectAttempts) {
          console.log(`[HMR] Connection lost, reconnecting... (${reconnectAttempts + 1}/${maxReconnectAttempts})`)
          setTimeout(() => {
            reconnectAttempts++
            connect()
          }, 1000 * Math.pow(2, reconnectAttempts)) // 指数退避
        } else {
          console.warn('[HMR] Max reconnection attempts reached')
        }
      }
      
      ws.onerror = (error) => {
        console.error('[HMR] Connection error:', error)
      }
      
    } catch (error) {
      console.error('[HMR] Failed to create WebSocket connection:', error)
    }
  }
  
  connect()
  return ws
}
```

## 🔧 调试技巧总结

### 1. 开发时调试

**日志系统**
```typescript
const debug = createDebugger('mini-vite:transform')

async function transformRequest(url: string) {
  debug(`Transforming: ${url}`)
  
  const start = performance.now()
  const result = await doTransform(url)
  const duration = performance.now() - start
  
  debug(`Transformed ${url} in ${duration.toFixed(2)}ms`)
  return result
}

function createDebugger(namespace: string) {
  const enabled = process.env.DEBUG?.includes(namespace)
  
  return (message: string, ...args: any[]) => {
    if (enabled) {
      console.log(`${namespace} ${message}`, ...args)
    }
  }
}
```

**性能监控**
```typescript
class Timer {
  private start: number
  
  constructor(private label: string) {
    this.start = performance.now()
  }
  
  end() {
    const duration = performance.now() - this.start
    console.log(`⏱️  ${this.label}: ${duration.toFixed(2)}ms`)
    return duration
  }
}

// 使用示例
const timer = new Timer('Module transformation')
await transformModule(code, id)
timer.end()
```

### 2. 模块图可视化

**调试端点**
```typescript
function setupDebugEndpoints(server: DevServer) {
  server.middlewares.use('/__debug/module-graph', (req, res) => {
    const graph = server.moduleGraph
    const nodes = Array.from(graph.urlToModuleMap.values()).map(mod => ({
      id: mod.id,
      importers: Array.from(mod.importers).map(m => m.id),
      importedModules: Array.from(mod.importedModules).map(m => m.id),
      lastHMRTimestamp: mod.lastHMRTimestamp
    }))
    
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(nodes, null, 2))
  })
}
```

### 3. 插件调试

**插件执行跟踪**
```typescript
class PluginContainer {
  async transform(code: string, id: string): Promise<TransformResult> {
    let result = { code, map: null }
    
    for (const plugin of this.plugins) {
      if (!plugin.transform) continue
      
      const pluginTimer = new Timer(`Plugin ${plugin.name}`)
      
      try {
        const transformResult = await plugin.transform(result.code, id)
        if (transformResult) {
          result = transformResult
          debug(`Plugin ${plugin.name} transformed ${id}`)
        }
      } catch (error) {
        console.error(`Plugin ${plugin.name} failed to transform ${id}:`, error)
        throw error
      } finally {
        pluginTimer.end()
      }
    }
    
    return result
  }
}
```

## 💪 性能优化实践

### 1. 缓存策略优化

**多层缓存设计**
```typescript
class CacheManager {
  private memoryCache = new Map<string, CacheEntry>()
  private diskCache: DiskCache
  
  constructor(cacheDir: string) {
    this.diskCache = new DiskCache(cacheDir)
  }
  
  async get(key: string): Promise<any> {
    // 1. 检查内存缓存
    const memoryEntry = this.memoryCache.get(key)
    if (memoryEntry && !this.isExpired(memoryEntry)) {
      return memoryEntry.value
    }
    
    // 2. 检查磁盘缓存
    const diskEntry = await this.diskCache.get(key)
    if (diskEntry && !this.isExpired(diskEntry)) {
      // 回写到内存缓存
      this.memoryCache.set(key, diskEntry)
      return diskEntry.value
    }
    
    return null
  }
  
  async set(key: string, value: any, ttl = 3600000) { // 1小时
    const entry = {
      value,
      timestamp: Date.now(),
      ttl
    }
    
    // 同时写入内存和磁盘
    this.memoryCache.set(key, entry)
    await this.diskCache.set(key, entry)
  }
}
```

### 2. 并发处理优化

**并行转换**
```typescript
class ParallelTransformer {
  private queue = new Map<string, Promise<TransformResult>>()
  
  async transform(code: string, id: string): Promise<TransformResult> {
    // 避免重复转换同一个模块
    if (this.queue.has(id)) {
      return this.queue.get(id)!
    }
    
    const transformPromise = this.doTransform(code, id)
    this.queue.set(id, transformPromise)
    
    try {
      const result = await transformPromise
      return result
    } finally {
      this.queue.delete(id)
    }
  }
  
  private async doTransform(code: string, id: string): Promise<TransformResult> {
    // 实际转换逻辑
    return await pluginContainer.transform(code, id)
  }
}
```

### 3. 内存使用优化

**弱引用缓存**
```typescript
class WeakCache {
  private cache = new WeakMap<object, any>()
  private refs = new Map<string, WeakRef<object>>()
  
  set(key: string, target: object, value: any) {
    this.cache.set(target, value)
    this.refs.set(key, new WeakRef(target))
  }
  
  get(key: string): any {
    const ref = this.refs.get(key)
    if (!ref) return undefined
    
    const target = ref.deref()
    if (!target) {
      this.refs.delete(key)
      return undefined
    }
    
    return this.cache.get(target)
  }
}
```

## 🎯 经验总结

### 关键学习点

1. **错误处理要全面**: 预期各种异常情况，提供友好的错误信息
2. **性能监控很重要**: 及时发现性能瓶颈，持续优化
3. **缓存策略需精心设计**: 平衡内存使用和性能提升
4. **调试工具不可少**: 完善的调试工具能大大提升开发效率
5. **渐进式优化**: 先实现功能，再逐步优化性能

### 避免的陷阱

1. **过早优化**: 在功能完善前不要过度关注性能
2. **忽略边界情况**: 循环依赖、文件不存在等情况要考虑
3. **缓存失效问题**: 确保缓存在文件变更时正确失效
4. **内存泄漏**: 注意清理事件监听器和定时器
5. **错误信息不清晰**: 提供足够的上下文信息帮助调试

## 🚀 下一步

现在您已经了解了开发过程中的主要挑战和解决方案，接下来可以：

1. **[学习最佳实践](./06-best-practices.md)** - 提升代码质量和可维护性
2. **[探索扩展方向](./07-future-improvements.md)** - 思考功能扩展和改进

继续深入学习，成为构建工具开发专家！🛠️

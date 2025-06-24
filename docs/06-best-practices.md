# 最佳实践和经验总结

## 📋 代码组织模式

### 1. 模块化架构设计

**分层架构原则**
```
┌─────────────────┐
│   CLI Layer     │  命令行接口，用户交互
├─────────────────┤
│  Service Layer  │  核心服务，业务逻辑
├─────────────────┤
│  Plugin Layer   │  插件系统，功能扩展
├─────────────────┤
│   Core Layer    │  基础设施，通用功能
├─────────────────┤
│  Utils Layer    │  工具函数，辅助功能
└─────────────────┘
```

**目录结构最佳实践**
```
src/
├── cli/                    # CLI 相关
│   ├── commands/          # 命令实现
│   └── index.ts           # CLI 入口
├── core/                  # 核心模块
│   ├── config.ts          # 配置管理
│   ├── logger.ts          # 日志系统
│   └── moduleGraph.ts     # 模块图
├── services/              # 业务服务
│   ├── dev-server/        # 开发服务器
│   ├── build/             # 构建服务
│   └── preview/           # 预览服务
├── plugins/               # 插件系统
│   ├── built-in/          # 内置插件
│   └── container.ts       # 插件容器
├── utils/                 # 工具函数
│   ├── fs.ts              # 文件系统工具
│   ├── path.ts            # 路径处理
│   └── performance.ts     # 性能工具
└── types/                 # 类型定义
    ├── config.ts          # 配置类型
    ├── plugin.ts          # 插件类型
    └── index.ts           # 导出类型
```

### 2. 接口设计原则

**单一职责原则**
```typescript
// ❌ 违反单一职责
interface DevServer {
  start(): void
  stop(): void
  transform(code: string): string
  resolveModule(id: string): string
  handleHMR(): void
  buildProduction(): void  // 不应该在开发服务器中
}

// ✅ 遵循单一职责
interface DevServer {
  start(): void
  stop(): void
  transformRequest(url: string): Promise<TransformResult>
}

interface ModuleResolver {
  resolveId(id: string, importer?: string): Promise<string | null>
}

interface HMRServer {
  handleUpdate(file: string): void
  broadcast(message: any): void
}
```

**依赖倒置原则**
```typescript
// ✅ 依赖抽象而非具体实现
interface Logger {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

class DevServer {
  constructor(
    private config: ResolvedConfig,
    private logger: Logger,  // 依赖抽象
    private moduleGraph: ModuleGraph
  ) {}
}

// 具体实现可以替换
const consoleLogger: Logger = new ConsoleLogger()
const fileLogger: Logger = new FileLogger()
```

### 3. 错误处理模式

**统一错误类型**
```typescript
export class MiniViteError extends Error {
  constructor(
    message: string,
    public code: string,
    public loc?: { line: number; column: number },
    public id?: string
  ) {
    super(message)
    this.name = 'MiniViteError'
  }
}

export class BuildError extends MiniViteError {
  constructor(message: string, id?: string, loc?: any) {
    super(message, 'BUILD_ERROR', loc, id)
  }
}

export class PluginError extends MiniViteError {
  constructor(message: string, public plugin: string) {
    super(`[${plugin}] ${message}`, 'PLUGIN_ERROR')
  }
}
```

**错误边界处理**
```typescript
async function safeExecute<T>(
  operation: () => Promise<T>,
  errorHandler: (error: Error) => T | Promise<T>
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof MiniViteError) {
      throw error // 重新抛出已知错误
    }
    
    // 处理未知错误
    return await errorHandler(error)
  }
}

// 使用示例
const result = await safeExecute(
  () => transformModule(code, id),
  (error) => {
    logger.error(`Transform failed: ${error.message}`)
    return { code, map: null }
  }
)
```

## 🚀 性能优化技巧

### 1. 缓存策略设计

**多级缓存架构**
```typescript
interface CacheStrategy {
  get(key: string): Promise<any>
  set(key: string, value: any, ttl?: number): Promise<void>
  invalidate(key: string): Promise<void>
}

class HybridCache implements CacheStrategy {
  constructor(
    private memoryCache: MemoryCache,
    private diskCache: DiskCache
  ) {}
  
  async get(key: string): Promise<any> {
    // L1: 内存缓存 (最快)
    let value = await this.memoryCache.get(key)
    if (value !== undefined) return value
    
    // L2: 磁盘缓存 (较快)
    value = await this.diskCache.get(key)
    if (value !== undefined) {
      // 回写到内存缓存
      await this.memoryCache.set(key, value)
      return value
    }
    
    return undefined
  }
  
  async set(key: string, value: any, ttl?: number): Promise<void> {
    // 同时写入两级缓存
    await Promise.all([
      this.memoryCache.set(key, value, ttl),
      this.diskCache.set(key, value, ttl)
    ])
  }
}
```

**智能缓存失效**
```typescript
class SmartCache {
  private dependencies = new Map<string, Set<string>>()
  
  addDependency(key: string, dependency: string) {
    if (!this.dependencies.has(dependency)) {
      this.dependencies.set(dependency, new Set())
    }
    this.dependencies.get(dependency)!.add(key)
  }
  
  async invalidateByDependency(dependency: string) {
    const dependents = this.dependencies.get(dependency)
    if (dependents) {
      await Promise.all(
        Array.from(dependents).map(key => this.invalidate(key))
      )
    }
  }
}
```

### 2. 并发处理优化

**请求去重**
```typescript
class RequestDeduplicator {
  private pending = new Map<string, Promise<any>>()
  
  async execute<T>(key: string, operation: () => Promise<T>): Promise<T> {
    // 如果已有相同请求在处理，直接返回
    if (this.pending.has(key)) {
      return this.pending.get(key) as Promise<T>
    }
    
    const promise = operation().finally(() => {
      this.pending.delete(key)
    })
    
    this.pending.set(key, promise)
    return promise
  }
}

// 使用示例
const deduplicator = new RequestDeduplicator()

async function transformModule(id: string): Promise<TransformResult> {
  return deduplicator.execute(`transform:${id}`, async () => {
    // 实际转换逻辑
    return await doTransform(id)
  })
}
```

**并行处理池**
```typescript
class WorkerPool<T, R> {
  private workers: Worker[] = []
  private queue: Array<{ task: T; resolve: (result: R) => void; reject: (error: Error) => void }> = []
  
  constructor(
    private workerCount: number,
    private workerFactory: () => Worker
  ) {
    this.initWorkers()
  }
  
  async execute(task: T): Promise<R> {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject })
      this.processQueue()
    })
  }
  
  private processQueue() {
    if (this.queue.length === 0) return
    
    const availableWorker = this.workers.find(w => w.isIdle)
    if (availableWorker) {
      const { task, resolve, reject } = this.queue.shift()!
      availableWorker.execute(task).then(resolve).catch(reject)
    }
  }
}
```

### 3. 内存管理优化

**对象池模式**
```typescript
class ObjectPool<T> {
  private pool: T[] = []
  private createFn: () => T
  private resetFn: (obj: T) => void
  
  constructor(createFn: () => T, resetFn: (obj: T) => void, initialSize = 10) {
    this.createFn = createFn
    this.resetFn = resetFn
    
    // 预创建对象
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(createFn())
    }
  }
  
  acquire(): T {
    return this.pool.pop() || this.createFn()
  }
  
  release(obj: T) {
    this.resetFn(obj)
    this.pool.push(obj)
  }
}

// 使用示例：复用 Transform 上下文
const transformContextPool = new ObjectPool(
  () => ({ code: '', map: null, id: '' }),
  (ctx) => { ctx.code = ''; ctx.map = null; ctx.id = '' }
)
```

## 🔧 可维护性设计

### 1. 配置管理最佳实践

**类型安全的配置**
```typescript
// 使用 TypeScript 严格类型检查
interface StrictConfig {
  readonly root: string
  readonly base: string
  readonly build: Readonly<{
    outDir: string
    sourcemap: boolean
    minify: 'esbuild' | 'terser' | false
  }>
}

// 配置验证
function validateConfig(config: any): asserts config is StrictConfig {
  if (typeof config.root !== 'string') {
    throw new Error('config.root must be a string')
  }
  
  if (!['esbuild', 'terser', false].includes(config.build?.minify)) {
    throw new Error('config.build.minify must be "esbuild", "terser", or false')
  }
}

// 配置默认值合并
function mergeConfig<T extends Record<string, any>>(
  defaults: T,
  overrides: Partial<T>
): T {
  const result = { ...defaults }
  
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      if (typeof value === 'object' && !Array.isArray(value)) {
        result[key] = mergeConfig(result[key] || {}, value)
      } else {
        result[key] = value
      }
    }
  }
  
  return result
}
```

### 2. 插件系统设计

**插件生命周期管理**
```typescript
class PluginManager {
  private plugins: Plugin[] = []
  private hooks = new Map<string, Function[]>()
  
  register(plugin: Plugin) {
    this.plugins.push(plugin)
    
    // 注册钩子函数
    Object.keys(plugin).forEach(key => {
      if (typeof plugin[key] === 'function' && key !== 'name') {
        if (!this.hooks.has(key)) {
          this.hooks.set(key, [])
        }
        this.hooks.get(key)!.push(plugin[key].bind(plugin))
      }
    })
  }
  
  async callHook(hookName: string, ...args: any[]): Promise<any[]> {
    const hooks = this.hooks.get(hookName) || []
    const results = []
    
    for (const hook of hooks) {
      try {
        const result = await hook(...args)
        if (result !== undefined) {
          results.push(result)
        }
      } catch (error) {
        console.error(`Plugin hook ${hookName} failed:`, error)
        throw error
      }
    }
    
    return results
  }
}
```

**插件通信机制**
```typescript
interface PluginContext {
  emitFile(fileName: string, source: string): string
  resolve(id: string, importer?: string): Promise<string | null>
  getModuleInfo(id: string): ModuleInfo | null
  warn(message: string): void
  error(message: string): never
}

function createPluginContext(
  config: ResolvedConfig,
  moduleGraph: ModuleGraph
): PluginContext {
  return {
    emitFile(fileName: string, source: string): string {
      // 生成文件并返回引用 ID
      return generateAssetId(fileName, source)
    },
    
    async resolve(id: string, importer?: string) {
      return await moduleGraph.resolveId(id, importer)
    },
    
    getModuleInfo(id: string) {
      return moduleGraph.getModuleById(id)
    },
    
    warn(message: string) {
      config.logger.warn(message)
    },
    
    error(message: string): never {
      throw new PluginError(message, 'unknown')
    }
  }
}
```

### 3. 测试策略

**单元测试结构**
```typescript
// 测试工具函数
describe('Utils', () => {
  describe('normalizePath', () => {
    it('should normalize Windows paths', () => {
      expect(normalizePath('C:\\Users\\test')).toBe('C:/Users/test')
    })
    
    it('should handle relative paths', () => {
      expect(normalizePath('./src/../dist')).toBe('dist')
    })
  })
})

// 测试核心功能
describe('ModuleGraph', () => {
  let moduleGraph: ModuleGraph
  
  beforeEach(() => {
    moduleGraph = new ModuleGraphImpl()
  })
  
  it('should track module dependencies', () => {
    const mod1 = moduleGraph.createModule('/src/a.js')
    const mod2 = moduleGraph.createModule('/src/b.js')
    
    moduleGraph.addImportedModule(mod1, mod2)
    
    expect(mod1.importedModules.has(mod2)).toBe(true)
    expect(mod2.importers.has(mod1)).toBe(true)
  })
})
```

**集成测试**
```typescript
describe('DevServer Integration', () => {
  let server: DevServer
  let tempDir: string
  
  beforeAll(async () => {
    tempDir = await createTempDir()
    await writeFile(join(tempDir, 'index.html'), '<div>test</div>')
    await writeFile(join(tempDir, 'main.js'), 'console.log("test")')
  })
  
  afterAll(async () => {
    await server?.close()
    await removeTempDir(tempDir)
  })
  
  it('should serve static files', async () => {
    const config = await resolveConfig({ root: tempDir })
    server = await createDevServer(config)
    await server.listen(0) // 随机端口
    
    const response = await fetch(`http://localhost:${server.port}/index.html`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<div>test</div>')
  })
})
```

## 🧪 测试策略

### 1. 测试金字塔

```
    /\
   /  \     E2E Tests (少量)
  /____\    - 完整流程测试
 /      \   - 用户场景验证
/________\  
           Integration Tests (适量)
          - 模块间协作测试
         - API 集成测试
        
        Unit Tests (大量)
       - 函数级别测试
      - 边界条件测试
```

### 2. Mock 策略

**文件系统 Mock**
```typescript
import { vi } from 'vitest'

// Mock fs 模块
vi.mock('fs', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  stat: vi.fn(),
  watch: vi.fn()
}))

// 测试中使用
it('should handle file read errors', async () => {
  const mockReadFile = vi.mocked(fs.readFile)
  mockReadFile.mockRejectedValue(new Error('File not found'))
  
  await expect(loadModule('/nonexistent.js')).rejects.toThrow('File not found')
})
```

### 3. 性能测试

**基准测试**
```typescript
import { performance } from 'perf_hooks'

describe('Performance', () => {
  it('should transform modules within acceptable time', async () => {
    const code = generateLargeCode(10000) // 生成大型代码
    
    const start = performance.now()
    await transformModule(code, '/test.js')
    const duration = performance.now() - start
    
    expect(duration).toBeLessThan(100) // 100ms 内完成
  })
  
  it('should handle concurrent requests efficiently', async () => {
    const requests = Array.from({ length: 100 }, (_, i) => 
      transformModule(`console.log(${i})`, `/test${i}.js`)
    )
    
    const start = performance.now()
    await Promise.all(requests)
    const duration = performance.now() - start
    
    expect(duration).toBeLessThan(1000) // 1秒内完成100个请求
  })
})
```

## 📊 监控和调试

### 1. 性能监控

**指标收集**
```typescript
class MetricsCollector {
  private metrics = new Map<string, number[]>()
  
  record(name: string, value: number) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, [])
    }
    this.metrics.get(name)!.push(value)
  }
  
  getStats(name: string) {
    const values = this.metrics.get(name) || []
    if (values.length === 0) return null
    
    const sorted = [...values].sort((a, b) => a - b)
    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: values.reduce((a, b) => a + b) / values.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    }
  }
}
```

### 2. 调试工具

**开发者面板**
```typescript
function setupDevPanel(server: DevServer) {
  server.middlewares.use('/__dev-panel', (req, res) => {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Mini Vite Dev Panel</title>
  <style>
    body { font-family: monospace; margin: 20px; }
    .metric { margin: 10px 0; padding: 10px; background: #f5f5f5; }
  </style>
</head>
<body>
  <h1>Mini Vite Development Panel</h1>
  
  <h2>Module Graph</h2>
  <div id="module-graph"></div>
  
  <h2>Performance Metrics</h2>
  <div id="metrics"></div>
  
  <script>
    // 实时更新数据
    setInterval(async () => {
      const [modules, metrics] = await Promise.all([
        fetch('/__dev-panel/modules').then(r => r.json()),
        fetch('/__dev-panel/metrics').then(r => r.json())
      ])
      
      document.getElementById('module-graph').innerHTML = 
        modules.map(m => \`<div>\${m.id} (\${m.importers.length} importers)</div>\`).join('')
      
      document.getElementById('metrics').innerHTML = 
        Object.entries(metrics).map(([name, stats]) => 
          \`<div class="metric">\${name}: \${JSON.stringify(stats)}</div>\`
        ).join('')
    }, 1000)
  </script>
</body>
</html>
`
    res.setHeader('Content-Type', 'text/html')
    res.end(html)
  })
}
```

## 🎯 总结

### 核心原则

1. **简单性优于复杂性**: 优先选择简单直接的解决方案
2. **可测试性**: 设计时考虑如何测试
3. **可扩展性**: 为未来的功能扩展留下空间
4. **性能意识**: 在关键路径上优化性能
5. **错误处理**: 提供清晰的错误信息和恢复机制

### 开发流程

1. **设计先行**: 先设计接口和架构，再实现细节
2. **测试驱动**: 编写测试用例，确保功能正确
3. **渐进优化**: 先实现功能，再优化性能
4. **持续重构**: 定期重构代码，保持代码质量
5. **文档同步**: 及时更新文档，保持文档与代码同步

### 质量保证

1. **代码审查**: 通过代码审查发现问题
2. **自动化测试**: 建立完善的测试体系
3. **性能监控**: 持续监控性能指标
4. **用户反馈**: 收集用户反馈，持续改进

## 🚀 下一步

现在您已经掌握了开发高质量构建工具的最佳实践，最后让我们：

1. **[探索扩展方向](./07-future-improvements.md)** - 思考未来的改进和扩展

通过这些最佳实践，您可以构建出高质量、可维护的现代构建工具！🎉

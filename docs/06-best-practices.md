# 6. 最佳实践和经验总结

## 6.1 代码组织模式

### 模块化设计原则

**单一职责原则**：
```typescript
// ✅ 好的设计：每个模块职责单一
// src/core/config.ts - 只负责配置管理
// src/core/logger.ts - 只负责日志处理
// src/core/moduleGraph.ts - 只负责模块图管理

// ❌ 避免：一个模块承担多个职责
// src/core/utils.ts - 包含配置、日志、模块图等各种功能
```

**依赖倒置原则**：
```typescript
// ✅ 依赖抽象接口，而非具体实现
interface Logger {
  info(msg: string): void
  error(msg: string): void
}

class DevServer {
  constructor(private logger: Logger) {}
}

// ❌ 直接依赖具体实现
class DevServer {
  constructor() {
    this.logger = new ConsoleLogger() // 硬编码依赖
  }
}
```

**接口隔离原则**：
```typescript
// ✅ 细粒度的接口设计
interface Resolver {
  resolveId(id: string, importer?: string): Promise<string | null>
}

interface Loader {
  load(id: string): Promise<string | null>
}

interface Transformer {
  transform(code: string, id: string): Promise<TransformResult | null>
}

// 插件可以选择实现需要的接口
class MyPlugin implements Resolver, Transformer {
  // 只实现需要的方法
}
```

### 错误处理模式

**统一的错误类型**：
```typescript
export class BuildError extends Error {
  constructor(
    message: string,
    public code?: string,
    public loc?: { file?: string; line?: number; column?: number }
  ) {
    super(message)
    this.name = 'BuildError'
  }
}

// 使用示例
throw new BuildError(
  'Failed to resolve module',
  'MODULE_NOT_FOUND',
  { file: '/src/main.js', line: 1, column: 10 }
)
```

**错误边界和恢复**：
```typescript
async function safeTransform(code: string, id: string): Promise<TransformResult> {
  try {
    return await transform(code, id)
  } catch (error) {
    // 记录错误但不中断整个流程
    logger.error(`Transform failed for ${id}:`, error)
    
    // 返回原始代码作为降级方案
    return { code, map: null }
  }
}
```

**渐进式错误处理**：
```typescript
// 插件错误不应该影响其他插件
async function runPluginHooks(plugins: Plugin[], hookName: string, ...args: any[]) {
  const results = []
  
  for (const plugin of plugins) {
    try {
      const result = await plugin[hookName]?.(...args)
      if (result !== undefined) {
        results.push(result)
      }
    } catch (error) {
      logger.error(`Plugin ${plugin.name} ${hookName} error:`, error)
      // 继续执行其他插件
    }
  }
  
  return results
}
```

## 6.2 性能优化技巧

### 缓存策略

**模块级缓存**：
```typescript
class ModuleCache {
  private cache = new Map<string, TransformResult>()
  private timestamps = new Map<string, number>()
  
  get(id: string, timestamp: number): TransformResult | null {
    const cached = this.cache.get(id)
    const cachedTime = this.timestamps.get(id)
    
    if (cached && cachedTime && cachedTime >= timestamp) {
      return cached
    }
    
    return null
  }
  
  set(id: string, result: TransformResult, timestamp: number): void {
    this.cache.set(id, result)
    this.timestamps.set(id, timestamp)
  }
  
  invalidate(id: string): void {
    this.cache.delete(id)
    this.timestamps.delete(id)
  }
}
```

**文件系统缓存**：
```typescript
class FileSystemCache {
  private cacheDir: string
  
  async get(key: string): Promise<any | null> {
    const cachePath = join(this.cacheDir, `${key}.json`)
    
    try {
      const content = await fs.readFile(cachePath, 'utf-8')
      return JSON.parse(content)
    } catch {
      return null
    }
  }
  
  async set(key: string, value: any): Promise<void> {
    const cachePath = join(this.cacheDir, `${key}.json`)
    await ensureDir(dirname(cachePath))
    await fs.writeFile(cachePath, JSON.stringify(value), 'utf-8')
  }
}
```

### 并发控制

**限制并发数量**：
```typescript
class ConcurrencyLimiter {
  private running = 0
  private queue: Array<() => void> = []
  
  constructor(private limit: number) {}
  
  async run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const execute = async () => {
        this.running++
        
        try {
          const result = await task()
          resolve(result)
        } catch (error) {
          reject(error)
        } finally {
          this.running--
          this.processQueue()
        }
      }
      
      if (this.running < this.limit) {
        execute()
      } else {
        this.queue.push(execute)
      }
    })
  }
  
  private processQueue(): void {
    if (this.queue.length > 0 && this.running < this.limit) {
      const next = this.queue.shift()!
      next()
    }
  }
}

// 使用示例
const limiter = new ConcurrencyLimiter(5)

async function transformFiles(files: string[]) {
  const promises = files.map(file => 
    limiter.run(() => transformFile(file))
  )
  
  return Promise.all(promises)
}
```

### 内存管理

**及时清理资源**：
```typescript
class ResourceManager {
  private resources = new Set<{ dispose(): void }>()
  
  register<T extends { dispose(): void }>(resource: T): T {
    this.resources.add(resource)
    return resource
  }
  
  dispose(): void {
    for (const resource of this.resources) {
      try {
        resource.dispose()
      } catch (error) {
        console.error('Failed to dispose resource:', error)
      }
    }
    this.resources.clear()
  }
}

// 在服务器关闭时清理资源
process.on('SIGTERM', () => {
  resourceManager.dispose()
  process.exit(0)
})
```

## 6.3 可维护性设计

### 配置验证

**类型安全的配置**：
```typescript
import Joi from 'joi'

const configSchema = Joi.object({
  root: Joi.string().default(process.cwd()),
  base: Joi.string().default('/'),
  server: Joi.object({
    port: Joi.number().min(1).max(65535).default(3000),
    host: Joi.string().default('localhost'),
    open: Joi.boolean().default(false),
  }).default({}),
  build: Joi.object({
    outDir: Joi.string().default('dist'),
    sourcemap: Joi.boolean().default(false),
    minify: Joi.boolean().default(true),
  }).default({}),
})

export function validateConfig(config: any): MiniViteConfig {
  const { error, value } = configSchema.validate(config)
  
  if (error) {
    throw new Error(`Invalid configuration: ${error.message}`)
  }
  
  return value
}
```

### 插件开发规范

**插件模板**：
```typescript
export interface PluginOptions {
  // 插件选项类型定义
}

export function createMyPlugin(options: PluginOptions = {}): Plugin {
  return {
    name: 'my-plugin',
    
    configResolved(config) {
      // 配置解析完成后的初始化
    },
    
    async resolveId(id, importer) {
      // 模块解析逻辑
      return null
    },
    
    async load(id) {
      // 模块加载逻辑
      return null
    },
    
    async transform(code, id) {
      // 代码转换逻辑
      return null
    },
  }
}
```

**插件测试模式**：
```typescript
// 插件单元测试
describe('MyPlugin', () => {
  it('should transform code correctly', async () => {
    const plugin = createMyPlugin()
    const result = await plugin.transform!('input code', '/test.js')
    
    expect(result).toEqual({
      code: 'expected output',
      map: null,
    })
  })
})

// 集成测试
describe('Plugin Integration', () => {
  it('should work with plugin container', async () => {
    const container = new PluginContainer(config, [createMyPlugin()])
    const result = await container.transform('input', '/test.js')
    
    expect(result).toBeDefined()
  })
})
```

### 日志和调试

**结构化日志**：
```typescript
interface LogContext {
  plugin?: string
  file?: string
  timestamp?: number
  [key: string]: any
}

class StructuredLogger {
  info(message: string, context: LogContext = {}) {
    this.log('info', message, context)
  }
  
  error(message: string, context: LogContext = {}) {
    this.log('error', message, context)
  }
  
  private log(level: string, message: string, context: LogContext) {
    const entry = {
      level,
      message,
      timestamp: Date.now(),
      ...context,
    }
    
    console.log(JSON.stringify(entry))
  }
}
```

**调试工具**：
```typescript
export function createDebugger(namespace: string) {
  const enabled = process.env.DEBUG?.includes(namespace) || process.env.DEBUG === '*'
  
  return (message: string, ...args: any[]) => {
    if (enabled) {
      console.log(`[${namespace}] ${message}`, ...args)
    }
  }
}

// 使用示例
const debug = createDebugger('mini-vite:transform')

async function transform(code: string, id: string) {
  debug('Transforming %s', id)
  debug('Input length: %d', code.length)
  
  const result = await doTransform(code, id)
  
  debug('Output length: %d', result.code.length)
  return result
}
```

## 6.4 测试策略

### 单元测试

**工具函数测试**：
```typescript
describe('Utils', () => {
  describe('normalizePath', () => {
    it('should convert backslashes to forward slashes', () => {
      expect(normalizePath('src\\main.js')).toBe('src/main.js')
    })
    
    it('should handle already normalized paths', () => {
      expect(normalizePath('src/main.js')).toBe('src/main.js')
    })
  })
  
  describe('cleanUrl', () => {
    it('should remove query parameters', () => {
      expect(cleanUrl('/main.js?t=123')).toBe('/main.js')
    })
    
    it('should remove hash fragments', () => {
      expect(cleanUrl('/main.js#section')).toBe('/main.js')
    })
  })
})
```

### 集成测试

**端到端测试**：
```typescript
describe('Mini Vite Integration', () => {
  let server: DevServer
  
  beforeEach(async () => {
    const config = await resolveConfig({
      root: '/tmp/test-project',
      server: { port: 0 }, // 随机端口
    })
    
    server = await createDevServer(config)
    await server.listen()
  })
  
  afterEach(async () => {
    await server.close()
  })
  
  it('should serve JavaScript files', async () => {
    const response = await fetch(`http://localhost:${server.port}/main.js`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('javascript')
  })
  
  it('should transform TypeScript files', async () => {
    const response = await fetch(`http://localhost:${server.port}/main.ts`)
    const code = await response.text()
    
    expect(code).not.toContain('interface') // TypeScript 语法应该被转换
    expect(code).toContain('export') // ES 模块语法应该保留
  })
})
```

## 6.5 文档和示例

### API 文档规范

```typescript
/**
 * 创建开发服务器
 * 
 * @param config - 解析后的配置对象
 * @returns Promise<DevServer> - 开发服务器实例
 * 
 * @example
 * ```typescript
 * const config = await resolveConfig({ root: './src' })
 * const server = await createDevServer(config)
 * await server.listen(3000)
 * ```
 */
export async function createDevServer(config: ResolvedConfig): Promise<DevServer> {
  // 实现
}
```

### 示例项目结构

```
examples/
├── basic/              # 基础 JavaScript 项目
├── typescript/         # TypeScript 项目
├── react/             # React 项目
├── vue/               # Vue 项目
└── custom-plugin/     # 自定义插件示例
```

这些最佳实践确保了代码的质量、性能和可维护性，为项目的长期发展奠定了坚实的基础。

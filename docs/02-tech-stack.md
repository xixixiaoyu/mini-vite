# 2. 技术选型与架构决策

## 2.1 核心技术栈

### TypeScript - 类型安全的开发体验

**选择理由**：
- **类型安全**：编译时发现错误，减少运行时问题
- **更好的 IDE 支持**：智能提示、重构、导航
- **代码可维护性**：清晰的接口定义和类型约束
- **团队协作**：统一的代码规范和接口契约

**在项目中的应用**：
```typescript
// 清晰的接口定义
interface Plugin {
  name: string
  transform?: (code: string, id: string) => TransformResult | null
  load?: (id: string) => string | null
}

// 类型安全的配置
interface MiniViteConfig {
  root?: string
  plugins?: Plugin[]
  server?: ServerOptions
}
```

**最佳实践**：
- 使用严格模式 (`strict: true`)
- 定义完整的类型接口
- 避免使用 `any` 类型
- 利用泛型提高代码复用性

### esbuild - 极速代码转换

**选择理由**：
- **性能极佳**：Go 语言编写，比传统工具快 10-100 倍
- **功能完整**：支持 TypeScript、JSX、ES6+ 转换
- **零配置**：开箱即用的转换能力
- **体积小巧**：不会显著增加项目大小

**应用场景**：
- TypeScript/JSX 代码转换
- 依赖预构建
- 生产环境代码压缩
- 配置文件编译

**配置示例**：
```typescript
await transform(code, {
  loader: 'ts',
  target: 'es2020',
  format: 'esm',
  sourcemap: true,
  jsx: 'transform',
})
```

### Rollup - 高效的模块打包

**选择理由**：
- **ES 模块优先**：原生支持 ES 模块，Tree Shaking 效果好
- **插件生态**：丰富的插件系统
- **代码分割**：智能的代码分割策略
- **输出质量**：生成的代码简洁高效

**与 Webpack 的对比**：
| 特性 | Rollup | Webpack |
|------|--------|---------|
| 主要用途 | 库和应用构建 | 复杂应用开发 |
| ES 模块支持 | 原生支持 | 需要配置 |
| Tree Shaking | 效果更好 | 支持但复杂 |
| 输出代码 | 简洁高效 | 包含运行时 |
| 配置复杂度 | 相对简单 | 较为复杂 |

**使用示例**：
```typescript
const bundle = await rollup({
  input: 'src/main.js',
  plugins: [
    // 自定义插件
  ],
  external: ['lodash'],
})
```

### chokidar - 可靠的文件监听

**选择理由**：
- **跨平台兼容**：统一的文件监听 API
- **性能优化**：高效的文件变更检测
- **功能丰富**：支持忽略模式、递归监听等
- **稳定可靠**：被广泛使用，bug 较少

**核心功能**：
```typescript
const watcher = chokidar.watch('src/**/*', {
  ignored: ['**/node_modules/**', '**/.git/**'],
  ignoreInitial: true,
})

watcher.on('change', (path) => {
  console.log(`File ${path} has been changed`)
})
```

### Connect - 轻量级的服务器框架

**选择理由**：
- **中间件架构**：灵活的请求处理流程
- **轻量级**：相比 Express 更简洁
- **可扩展**：易于添加自定义中间件
- **性能好**：适合开发服务器场景

**中间件示例**：
```typescript
const app = connect()

app.use('/api', (req, res, next) => {
  // API 处理逻辑
  next()
})

app.use(staticMiddleware)
```

### WebSocket (ws) - 实时通信

**选择理由**：
- **实时性**：支持双向实时通信
- **轻量级**：简单易用的 API
- **性能好**：高效的消息传递
- **标准化**：基于 WebSocket 标准

**HMR 通信示例**：
```typescript
const wss = new WebSocketServer({ port: 3001 })

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: 'connected'
  }))
})
```

## 2.2 架构设计原则

### 模块化设计

**目录结构**：
```
src/
├── core/           # 核心功能模块
│   ├── config.ts   # 配置管理
│   ├── logger.ts   # 日志系统
│   └── moduleGraph.ts # 模块依赖图
├── dev-server/     # 开发服务器模块
│   ├── index.ts    # 服务器主逻辑
│   ├── hmr.ts      # 热更新实现
│   └── pluginContainer.ts # 插件容器
├── build/          # 构建系统模块
├── plugins/        # 插件系统模块
├── deps/           # 依赖优化模块
└── utils/          # 工具函数模块
```

**设计优势**：
- **职责清晰**：每个模块负责特定功能
- **易于测试**：可以独立测试各个模块
- **便于维护**：修改某个功能不影响其他模块
- **可复用性**：模块可以在不同场景下复用

### 插件驱动架构

**插件接口设计**：
```typescript
interface Plugin {
  name: string
  // 配置阶段
  configResolved?: (config: ResolvedConfig) => void
  // 构建阶段
  buildStart?: (opts: any) => void
  resolveId?: (id: string, importer?: string) => string | null
  load?: (id: string) => string | null
  transform?: (code: string, id: string) => TransformResult | null
  // 生成阶段
  generateBundle?: (opts: any, bundle: any) => void
  writeBundle?: (opts: any, bundle: any) => void
  // 开发服务器
  configureServer?: (server: DevServer) => void
  handleHotUpdate?: (ctx: HmrContext) => void
}
```

**架构优势**：
- **可扩展性**：通过插件添加新功能
- **解耦合**：核心功能与扩展功能分离
- **标准化**：统一的插件接口和生命周期
- **生态建设**：便于第三方插件开发

### 配置驱动设计

**配置层次结构**：
```
用户配置 → 默认配置 → 环境变量 → 插件配置 → 最终配置
```

**配置合并策略**：
```typescript
function deepMerge<T>(target: T, source: Partial<T>): T {
  // 深度合并逻辑
  // 处理对象、数组、基本类型
  // 保持类型安全
}
```

## 2.3 技术选型对比

### 代码转换工具对比

| 工具 | 性能 | 功能 | 生态 | 学习成本 |
|------|------|------|------|----------|
| esbuild | 极快 | 基础完整 | 较新 | 低 |
| Babel | 较慢 | 功能丰富 | 成熟 | 高 |
| SWC | 很快 | 功能完整 | 发展中 | 中 |

**选择 esbuild 的原因**：
- 性能是最大优势，符合快速开发的需求
- 功能足够满足基本的转换需求
- 配置简单，降低复杂度

### 打包工具对比

| 工具 | 适用场景 | 配置复杂度 | 输出质量 | 生态成熟度 |
|------|----------|------------|----------|------------|
| Rollup | 库/应用构建 | 中等 | 高 | 成熟 |
| Webpack | 复杂应用 | 高 | 中 | 非常成熟 |
| Parcel | 快速原型 | 低 | 中 | 发展中 |

**选择 Rollup 的原因**：
- ES 模块原生支持，符合现代开发趋势
- Tree Shaking 效果好，输出代码质量高
- 插件系统设计优雅，易于扩展

### 服务器框架对比

| 框架 | 性能 | 功能 | 复杂度 | 适用场景 |
|------|------|------|--------|----------|
| Connect | 高 | 基础 | 低 | 开发服务器 |
| Express | 中 | 丰富 | 中 | Web 应用 |
| Koa | 高 | 现代 | 中 | 现代应用 |

**选择 Connect 的原因**：
- 轻量级，性能好
- 中间件架构灵活
- 足够满足开发服务器需求

## 2.4 架构决策的权衡

### 性能 vs 功能

**决策原则**：
- 优先保证核心功能的性能
- 通过插件系统扩展功能
- 避免过度设计和功能膨胀

### 简单 vs 完整

**平衡策略**：
- 核心功能保持简单易懂
- 提供足够的扩展点
- 文档和示例要完整

### 学习成本 vs 功能强大

**设计思路**：
- 降低入门门槛
- 提供渐进式学习路径
- 保持 API 的一致性和直观性

这些技术选型和架构决策确保了 Mini Vite 既具备现代构建工具的核心能力，又保持了代码的简洁性和可理解性，为学习者提供了一个优秀的学习案例。

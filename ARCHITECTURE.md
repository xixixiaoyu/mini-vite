# Mini Vite 架构设计文档

## 概述

Mini Vite 是一个轻量级的前端构建工具，模仿 Vite 的核心功能，包括快速开发服务器、高效构建系统、插件架构和依赖预构建。

## 核心架构

### 1. 模块结构

```
src/
├── core/           # 核心功能
│   ├── config.ts   # 配置解析和管理
│   ├── logger.ts   # 日志系统
│   └── moduleGraph.ts # 模块依赖图
├── dev-server/     # 开发服务器
│   ├── index.ts    # 主服务器逻辑
│   ├── hmr.ts      # 热更新实现
│   └── pluginContainer.ts # 插件容器
├── build/          # 构建系统
│   └── index.ts    # 生产构建逻辑
├── deps/           # 依赖优化
│   └── optimizer.ts # 依赖预构建
├── plugins/        # 内置插件
│   └── index.ts    # 默认插件集合
├── preview/        # 预览服务器
│   └── index.ts    # 生产预览
├── types/          # TypeScript 类型定义
│   └── index.ts    # 核心类型
└── utils/          # 工具函数
    └── index.ts    # 通用工具
```

### 2. 核心组件

#### 配置系统 (core/config.ts)
- 支持多种配置文件格式 (.js, .ts, .mjs)
- 环境变量加载和处理
- 配置合并和验证
- 插件配置解析

#### 模块图 (core/moduleGraph.ts)
- 跟踪模块间的依赖关系
- 支持 HMR 更新传播
- 模块缓存和失效管理
- 循环依赖检测

#### 开发服务器 (dev-server/)
- 基于 Connect 的中间件架构
- ES 模块原生支持
- 实时模块转换
- 静态资源服务

#### 热更新系统 (dev-server/hmr.ts)
- WebSocket 通信
- 文件监听 (chokidar)
- 智能更新策略
- 错误恢复机制

#### 插件系统 (plugins/)
- 统一的插件接口
- 生命周期钩子
- 异步插件支持
- 内置插件集合

#### 构建系统 (build/)
- 基于 Rollup 的打包
- 代码分割和优化
- 资源处理和哈希
- HTML 模板处理

#### 依赖优化 (deps/optimizer.ts)
- esbuild 预构建
- 依赖扫描和分析
- 缓存管理
- 增量更新

## 关键设计决策

### 1. 插件架构

采用类似 Rollup 的插件系统，支持以下钩子：

```typescript
interface Plugin {
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
```

### 2. 模块转换流程

1. **请求拦截**: 开发服务器拦截模块请求
2. **ID 解析**: 通过插件链解析模块 ID
3. **内容加载**: 从文件系统或插件加载模块内容
4. **代码转换**: 通过插件链转换代码 (TS -> JS, CSS -> JS 等)
5. **缓存存储**: 将转换结果存储在模块图中
6. **响应返回**: 返回转换后的代码给浏览器

### 3. HMR 实现

```
文件变更 -> 文件监听器 -> 模块图更新 -> 影响分析 -> WebSocket 通知 -> 浏览器更新
```

- 使用 chokidar 监听文件变更
- 通过模块图分析影响范围
- WebSocket 推送更新信息
- 浏览器端动态导入新模块

### 4. 依赖预构建

```
扫描入口 -> 分析依赖 -> esbuild 构建 -> 缓存存储 -> 开发时重写导入
```

- 扫描项目入口文件
- 提取裸模块导入
- 使用 esbuild 预构建为 ESM
- 开发时重写导入路径

## 性能优化

### 1. 开发时优化
- **依赖预构建**: 将 CommonJS 依赖转换为 ESM
- **模块缓存**: 避免重复转换
- **增量更新**: 只更新变更的模块
- **并行处理**: 异步插件执行

### 2. 构建时优化
- **代码分割**: 自动分割第三方依赖
- **Tree Shaking**: 移除未使用代码
- **资源优化**: 压缩和哈希处理
- **并行构建**: 利用 Rollup 的并行能力

## 扩展性设计

### 1. 插件生态
- 标准化的插件接口
- 丰富的生命周期钩子
- 插件间通信机制
- 插件配置和选项

### 2. 配置灵活性
- 多种配置文件格式
- 环境特定配置
- 条件配置
- 配置继承和合并

### 3. 工具集成
- TypeScript 原生支持
- CSS 预处理器集成
- 静态资源处理
- 测试工具集成

## 与 Vite 的对比

### 相似之处
- ES 模块优先的开发体验
- 快速的热更新
- 插件驱动的架构
- 依赖预构建优化

### 简化之处
- 更简单的插件系统
- 基础的 CSS 处理
- 简化的配置选项
- 核心功能聚焦

### 技术选型
- **开发服务器**: Connect + 自定义中间件
- **构建工具**: Rollup
- **代码转换**: esbuild
- **文件监听**: chokidar
- **WebSocket**: ws
- **静态服务**: sirv

## 未来扩展方向

1. **更多文件类型支持**: Vue, React, Svelte 组件
2. **CSS 预处理器**: Sass, Less, Stylus
3. **高级优化**: 预加载、懒加载、Service Worker
4. **开发工具**: 调试器、性能分析、错误边界
5. **部署集成**: Docker、CI/CD、云平台

这个架构设计确保了 Mini Vite 既保持了简洁性，又具备了良好的扩展性和性能。

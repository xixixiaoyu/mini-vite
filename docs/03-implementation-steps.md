# 3. 分步骤实现过程

## 3.1 项目初始化和基础配置

### 步骤 1：创建项目结构

```bash
mkdir mini-vite
cd mini-vite
npm init -y
```

**关键决策**：
- 使用 npm 作为包管理器
- 采用标准的 Node.js 项目结构
- 支持 ES 模块格式

### 步骤 2：配置 TypeScript

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "examples"]
}
```

**关键配置说明**：
- `module: "ESNext"`：输出 ES 模块格式，支持现代模块系统
- `target: "ES2020"`：支持现代 JavaScript 特性
- `strict: true`：启用严格类型检查，提高代码质量
- `declaration: true`：生成类型声明文件，支持 TypeScript 用户

### 步骤 3：安装核心依赖

```json
{
  "dependencies": {
    "esbuild": "^0.19.0",      // 高性能代码转换
    "rollup": "^4.0.0",        // 模块打包工具
    "chokidar": "^3.5.3",      // 文件监听
    "ws": "^8.14.0",           // WebSocket 通信
    "connect": "^3.7.0",       // 服务器框架
    "sirv": "^2.0.3",          // 静态文件服务
    "mime-types": "^2.1.35",   // MIME 类型处理
    "magic-string": "^0.30.0", // 字符串操作
    "es-module-lexer": "^1.3.0" // ES 模块解析
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/ws": "^8.5.0",
    "@types/mime-types": "^2.1.0",
    "@types/connect": "^3.4.0",
    "typescript": "^5.0.0"
  }
}
```

**依赖选择理由**：
- 每个依赖都有明确的用途和不可替代性
- 优先选择性能好、维护活跃的库
- 保持依赖数量的精简

## 3.2 核心类型定义的设计思路

### 设计原则

1. **接口优先**：先定义接口，再实现功能
2. **类型安全**：所有公共 API 都有明确的类型定义
3. **可扩展性**：接口设计考虑未来扩展需求
4. **一致性**：命名和结构保持一致

### 核心类型设计

```typescript
// src/types/index.ts

// 配置系统类型
export interface MiniViteConfig {
  root?: string                    // 项目根目录
  base?: string                    // 公共基础路径
  plugins?: Plugin[]               // 插件列表
  server?: ServerOptions           // 服务器配置
  build?: BuildOptions             // 构建配置
  optimizeDeps?: OptimizeDepsOptions // 依赖优化配置
}

// 插件系统类型
export interface Plugin {
  name: string                     // 插件名称
  // 生命周期钩子
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

// 模块图类型
export interface ModuleNode {
  id: string                       // 模块 ID
  file: string | null              // 文件路径
  importers: Set<ModuleNode>       // 导入此模块的模块
  importedModules: Set<ModuleNode> // 此模块导入的模块
  acceptedHmrDeps: Set<ModuleNode> // HMR 接受的依赖
  isSelfAccepting: boolean         // 是否自接受 HMR
  transformResult: TransformResult | null // 转换结果
  lastHMRTimestamp: number         // 最后 HMR 时间戳
}
```

**设计思考**：
- **可选属性**：大部分配置都是可选的，提供合理默认值
- **泛型支持**：在需要的地方使用泛型提高灵活性
- **联合类型**：使用联合类型表示多种可能的值
- **接口继承**：通过继承复用公共接口定义

## 3.3 配置系统的实现方法

### 配置加载流程

```
查找配置文件 → 加载配置文件 → 合并默认配置 → 解析环境变量 → 调用插件钩子 → 返回最终配置
```

### 实现要点

**1. 配置文件查找**
```typescript
async function findConfigFile(root: string): Promise<string | null> {
  const configFiles = [
    'mini-vite.config.js',
    'mini-vite.config.ts',
    'mini-vite.config.mjs',
  ]
  
  for (const file of configFiles) {
    const configPath = join(root, file)
    if (await pathExists(configPath)) {
      return configPath
    }
  }
  
  return null
}
```

**2. TypeScript 配置文件处理**
```typescript
async function loadConfigFile(configPath: string): Promise<MiniViteConfig> {
  if (configPath.endsWith('.ts')) {
    // 使用 esbuild 编译 TypeScript 配置文件
    const { build } = await import('esbuild')
    const result = await build({
      entryPoints: [configPath],
      format: 'esm',
      platform: 'node',
      write: false,
      bundle: true,
      external: ['esbuild'],
    })
    
    const code = result.outputFiles[0].text
    const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
    const module = await import(dataUrl)
    return module.default || module
  }
  
  // 直接导入 JS/MJS 文件
  const module = await import(`file://${configPath}`)
  return module.default || module
}
```

**3. 配置合并策略**
```typescript
function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...target }
  
  for (const key in source) {
    const sourceValue = source[key]
    const targetValue = result[key]
    
    if (isObject(sourceValue) && isObject(targetValue)) {
      result[key] = deepMerge(targetValue, sourceValue)
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue
    }
  }
  
  return result
}
```

**4. 环境变量处理**
```typescript
function loadEnv(mode: string, root: string): Record<string, any> {
  const env: Record<string, any> = {}
  
  const envFiles = [
    `.env`,
    `.env.local`,
    `.env.${mode}`,
    `.env.${mode}.local`,
  ]
  
  for (const file of envFiles) {
    const envPath = join(root, file)
    try {
      const content = fs.readFileSync(envPath, 'utf-8')
      // 解析环境变量
      parseEnvFile(content, env)
    } catch {
      // 文件不存在，忽略
    }
  }
  
  return env
}
```

## 3.4 模块图和依赖管理的构建

### 模块图的作用

1. **依赖跟踪**：记录模块间的依赖关系
2. **HMR 支持**：确定热更新的影响范围
3. **缓存管理**：避免重复转换相同模块
4. **循环依赖检测**：发现和处理循环依赖

### 实现核心逻辑

```typescript
export class ModuleGraphImpl implements ModuleGraph {
  private urlToModuleMap = new Map<string, ModuleNode>()
  private idToModuleMap = new Map<string, ModuleNode>()
  private fileToModulesMap = new Map<string, Set<ModuleNode>>()

  ensureEntryFromUrl(rawUrl: string): ModuleNode {
    const url = cleanUrl(rawUrl)
    let mod = this.urlToModuleMap.get(url)
    
    if (!mod) {
      mod = new ModuleNodeImpl(url)
      this.urlToModuleMap.set(url, mod)
      this.idToModuleMap.set(url, mod)
      
      // 建立文件到模块的映射
      if (url.startsWith('/')) {
        const file = normalizePath(url)
        let fileMods = this.fileToModulesMap.get(file)
        if (!fileMods) {
          fileMods = new Set()
          this.fileToModulesMap.set(file, fileMods)
        }
        fileMods.add(mod)
        mod.file = file
      }
    }
    
    return mod
  }

  updateModuleInfo(mod: ModuleNode, importedModules: Set<string | ModuleNode>): void {
    const prevImports = mod.importedModules
    const nextImports = new Set<ModuleNode>()

    // 处理新的导入
    for (const imported of importedModules) {
      const dep = typeof imported === 'string' 
        ? this.ensureEntryFromUrl(imported)
        : imported
      
      dep.importers.add(mod)
      nextImports.add(dep)
    }

    // 清理旧的导入关系
    prevImports.forEach(dep => {
      if (!nextImports.has(dep)) {
        dep.importers.delete(mod)
      }
    })

    mod.importedModules = nextImports
  }

  invalidateModule(mod: ModuleNode): void {
    // 清除转换结果
    mod.transformResult = null
    
    // 递归失效依赖此模块的模块
    mod.importers.forEach(importer => {
      if (!importer.acceptedHmrDeps.has(mod) && !importer.isSelfAccepting) {
        this.invalidateModule(importer)
      }
    })
  }
}
```

**关键设计点**：
- **双向映射**：URL → 模块、文件 → 模块
- **依赖关系维护**：自动维护导入者和被导入者的关系
- **内存管理**：及时清理不再需要的依赖关系
- **HMR 支持**：为热更新提供必要的依赖信息

## 3.5 工具函数的设计

### 路径处理工具

```typescript
export function normalizePath(id: string): string {
  return id.replace(/\\/g, '/')
}

export function cleanUrl(url: string): string {
  return url.replace(/[?#].*$/, '')
}

export function isAbsolute(path: string): boolean {
  return path.startsWith('/') || /^[a-zA-Z]:/.test(path)
}
```

### 文件系统工具

```typescript
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
```

### 模块类型判断

```typescript
export function isJSRequest(url: string): boolean {
  const cleanedUrl = cleanUrl(url)
  return /\.(js|ts|jsx|tsx)$/.test(cleanedUrl) || !cleanedUrl.includes('.')
}

export function isCSSRequest(url: string): boolean {
  return cleanUrl(url).endsWith('.css')
}

export function isStaticAsset(id: string): boolean {
  const ext = extname(cleanUrl(id))
  return ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'].includes(ext)
}
```

这些基础设施为后续的功能实现提供了坚实的基础，确保了代码的可维护性和扩展性。

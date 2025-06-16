# Mini Vite

一个轻量级的类似 Vite 的前端构建工具，支持快速开发和高效构建。

## 🚀 特性

- **快速开发服务器** - 基于 ES 模块的即时热更新（HMR）
- **高效构建** - 使用 Rollup 进行生产环境打包优化
- **插件系统** - 灵活的插件架构，支持功能扩展
- **依赖预构建** - 使用 esbuild 预构建依赖，提升开发启动速度
- **TypeScript 支持** - 内置 TypeScript 和 JSX 转换
- **CSS 处理** - 支持 CSS 模块和样式注入
- **静态资源处理** - 自动处理图片、字体等静态资源

## 📦 安装

```bash
npm install mini-vite --save-dev
```

或者全局安装：

```bash
npm install -g mini-vite
```

## 🛠️ 使用方法

### 开发模式

启动开发服务器：

```bash
mini-vite dev
# 或
mini-vite serve
```

选项：
- `-p, --port <port>` - 指定端口（默认：3000）
- `-h, --host <host>` - 指定主机（默认：localhost）
- `--open` - 启动时打开浏览器
- `-c, --config <file>` - 指定配置文件

### 生产构建

构建生产版本：

```bash
mini-vite build
```

选项：
- `-o, --outDir <dir>` - 输出目录（默认：dist）
- `--sourcemap` - 生成 sourcemap
- `--minify` - 压缩输出
- `-c, --config <file>` - 指定配置文件

### 预览构建

预览生产构建：

```bash
mini-vite preview
```

选项：
- `-p, --port <port>` - 指定端口（默认：4173）
- `-h, --host <host>` - 指定主机（默认：localhost）
- `--open` - 启动时打开浏览器

## ⚙️ 配置

在项目根目录创建 `mini-vite.config.js` 文件：

```javascript
import { defineConfig } from 'mini-vite';

export default defineConfig({
  root: '.',
  base: '/',
  publicDir: 'public',
  
  server: {
    port: 3000,
    host: 'localhost',
    open: true,
    hmr: true,
  },
  
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    minify: 'esbuild',
    target: 'es2020',
  },
  
  optimizeDeps: {
    entries: ['index.html'],
    exclude: [],
    include: [],
  },
  
  plugins: [
    // 自定义插件
  ],
});
```

### 配置选项

#### 基础选项

- `root` - 项目根目录
- `base` - 公共基础路径
- `publicDir` - 静态资源目录

#### 服务器选项

- `server.port` - 开发服务器端口
- `server.host` - 开发服务器主机
- `server.open` - 启动时是否打开浏览器
- `server.hmr` - 是否启用热更新

#### 构建选项

- `build.outDir` - 构建输出目录
- `build.assetsDir` - 静态资源输出目录
- `build.sourcemap` - 是否生成 sourcemap
- `build.minify` - 压缩方式（'esbuild' | 'terser' | false）
- `build.target` - 构建目标

#### 依赖优化选项

- `optimizeDeps.entries` - 入口文件
- `optimizeDeps.exclude` - 排除的依赖
- `optimizeDeps.include` - 包含的依赖

## 🔌 插件系统

Mini Vite 支持灵活的插件系统。内置插件包括：

- **别名插件** - 路径别名解析
- **esbuild 插件** - TypeScript/JSX 转换
- **CSS 插件** - CSS 处理和注入
- **静态资源插件** - 静态资源处理
- **HTML 插件** - HTML 文件处理
- **导入分析插件** - ES 模块导入分析

### 自定义插件

```javascript
function myPlugin() {
  return {
    name: 'my-plugin',
    transform(code, id) {
      // 转换代码
      return { code: transformedCode, map: null };
    },
    load(id) {
      // 加载模块
      return null;
    },
    resolveId(id, importer) {
      // 解析模块 ID
      return null;
    }
  };
}

export default defineConfig({
  plugins: [myPlugin()],
});
```

## 📁 项目结构

```
my-project/
├── index.html          # 入口 HTML 文件
├── src/
│   ├── main.js         # 主入口文件
│   ├── style.css       # 样式文件
│   └── components/     # 组件目录
├── public/             # 静态资源目录
├── dist/               # 构建输出目录
└── mini-vite.config.js # 配置文件
```

## 🌟 示例

查看 `examples/basic` 目录中的完整示例项目。

运行示例：

```bash
cd examples/basic
npm install
mini-vite dev
```

## 🔧 开发

克隆仓库并安装依赖：

```bash
git clone <repository-url>
cd mini-vite
npm install
```

构建项目：

```bash
npm run build
```

运行示例：

```bash
npm run example:dev
```

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📚 API 文档

### createDevServer(config)

创建开发服务器实例。

### build(config)

执行生产构建。

### resolveConfig(inlineConfig, command, mode)

解析配置文件。

### defineConfig(config)

定义配置的辅助函数，提供类型提示。

## 🔍 故障排除

### 常见问题

1. **端口被占用**
   - 使用 `-p` 选项指定其他端口
   - 或者关闭占用端口的程序

2. **模块解析失败**
   - 检查文件路径是否正确
   - 确保文件扩展名正确

3. **HMR 不工作**
   - 检查 WebSocket 连接是否正常
   - 确保防火墙没有阻止连接

4. **构建失败**
   - 检查代码语法错误
   - 查看详细错误信息

更多问题请查看 [Issues](https://github.com/your-repo/mini-vite/issues) 页面。

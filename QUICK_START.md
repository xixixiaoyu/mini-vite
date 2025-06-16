# Mini Vite 快速开始指南

## 🚀 5 分钟上手

### 1. 安装依赖

```bash
# 克隆项目
git clone <repository-url>
cd mini-vite

# 安装依赖
npm install

# 构建项目
npm run build
```

### 2. 创建新项目

```bash
# 创建项目目录
mkdir my-app
cd my-app

# 创建基本文件结构
mkdir src
```

### 3. 创建入口文件

**index.html**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My App</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./src/main.js"></script>
</body>
</html>
```

**src/main.js**
```javascript
import './style.css'

console.log('Hello Mini Vite!')

document.getElementById('app').innerHTML = `
  <h1>Hello Mini Vite!</h1>
  <p>Edit src/main.js to get started.</p>
`
```

**src/style.css**
```css
body {
  font-family: Arial, sans-serif;
  margin: 0;
  padding: 20px;
  background: #f0f0f0;
}

h1 {
  color: #333;
}
```

### 4. 启动开发服务器

```bash
# 使用相对路径运行 mini-vite
node ../mini-vite/bin/mini-vite.js dev

# 或者如果全局安装了
mini-vite dev
```

访问 http://localhost:3000 查看你的应用！

### 5. 构建生产版本

```bash
# 构建
node ../mini-vite/bin/mini-vite.js build

# 预览构建结果
node ../mini-vite/bin/mini-vite.js preview
```

## 📁 项目结构

```
my-app/
├── index.html          # 入口 HTML
├── src/
│   ├── main.js         # 主 JS 文件
│   ├── style.css       # 样式文件
│   └── components/     # 组件目录
├── public/             # 静态资源
├── dist/               # 构建输出
└── mini-vite.config.js # 配置文件（可选）
```

## ⚙️ 配置文件

创建 `mini-vite.config.js`：

```javascript
import { defineConfig } from '../mini-vite/dist/index.js'

export default defineConfig({
  root: '.',
  base: '/',
  
  server: {
    port: 3000,
    open: true,
  },
  
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'esbuild',
  },
})
```

## 🔥 热更新体验

1. 启动开发服务器
2. 修改 `src/main.js` 或 `src/style.css`
3. 保存文件
4. 浏览器自动更新，无需刷新！

## 📦 支持的文件类型

- **JavaScript**: `.js`, `.mjs`
- **TypeScript**: `.ts`, `.tsx`
- **CSS**: `.css`
- **静态资源**: `.png`, `.jpg`, `.svg`, `.ico` 等
- **HTML**: `.html`

## 🛠️ 常用命令

```bash
# 开发模式
mini-vite dev
mini-vite dev --port 8080
mini-vite dev --host 0.0.0.0

# 构建
mini-vite build
mini-vite build --outDir build
mini-vite build --sourcemap

# 预览
mini-vite preview
mini-vite preview --port 8080
```

## 🎯 TypeScript 支持

创建 `src/main.ts`：

```typescript
interface User {
  name: string
  age: number
}

const user: User = {
  name: 'Mini Vite',
  age: 1
}

console.log(`Hello ${user.name}!`)
```

Mini Vite 会自动转换 TypeScript 代码！

## 🎨 CSS 模块

CSS 文件会被自动处理并注入到页面中：

```css
/* src/components/button.css */
.button {
  background: #007acc;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
}

.button:hover {
  background: #005a9e;
}
```

```javascript
// src/components/button.js
import './button.css'

export function createButton(text) {
  const button = document.createElement('button')
  button.className = 'button'
  button.textContent = text
  return button
}
```

## 🔌 自定义插件

```javascript
// mini-vite.config.js
function myPlugin() {
  return {
    name: 'my-plugin',
    transform(code, id) {
      if (id.endsWith('.special')) {
        return {
          code: `export default ${JSON.stringify(code)}`,
          map: null
        }
      }
    }
  }
}

export default defineConfig({
  plugins: [myPlugin()]
})
```

## 🐛 故障排除

### 端口被占用
```bash
# 使用不同端口
mini-vite dev --port 3001
```

### 模块解析失败
- 检查文件路径是否正确
- 确保文件扩展名正确
- 查看控制台错误信息

### HMR 不工作
- 检查 WebSocket 连接
- 确保防火墙允许连接
- 重启开发服务器

### 构建失败
- 检查代码语法
- 查看详细错误信息
- 确保所有依赖已安装

## 📚 更多示例

查看 `examples/` 目录中的完整示例：

- `examples/basic/` - 基础 JavaScript 项目
- 更多示例即将添加...

## 🤝 获取帮助

- 查看 [README.md](./README.md) 了解详细文档
- 查看 [ARCHITECTURE.md](./ARCHITECTURE.md) 了解架构设计
- 提交 Issue 报告问题
- 贡献代码改进项目

开始你的 Mini Vite 之旅吧！🎉

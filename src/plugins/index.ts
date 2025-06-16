import { Plugin, TransformResult } from '../types/index.js'
import { resolve, extname } from 'path'
import { readFile, isJSRequest, isCSSRequest, isStaticAsset } from '../utils/index.js'
import { transform } from 'esbuild'

/**
 * 别名解析插件
 */
export function aliasPlugin(aliases: Record<string, string> = {}): Plugin {
  return {
    name: 'alias',
    resolveId(id: string, importer?: string) {
      for (const [alias, replacement] of Object.entries(aliases)) {
        if (id === alias || id.startsWith(alias + '/')) {
          return id.replace(alias, replacement)
        }
      }
      return null
    },
  }
}

/**
 * TypeScript/JavaScript 转换插件
 */
export function esbuildPlugin(): Plugin {
  return {
    name: 'esbuild',
    async transform(code: string, id: string): Promise<TransformResult | null> {
      if (!isJSRequest(id)) return null

      const ext = extname(id)
      if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) return null

      try {
        const result = await transform(code, {
          loader: ext.slice(1) as any,
          target: 'es2020',
          format: 'esm',
          sourcemap: true,
          jsx: 'transform',
          jsxFactory: 'React.createElement',
          jsxFragment: 'React.Fragment',
        })

        return {
          code: result.code,
          map: result.map || null,
        }
      } catch (error) {
        console.error(`Transform error in ${id}:`, error)
        throw error
      }
    },
  }
}

/**
 * CSS 处理插件
 */
export function cssPlugin(): Plugin {
  return {
    name: 'css',
    async load(id: string) {
      if (!isCSSRequest(id)) return null

      try {
        const css = await readFile(id)
        // 简单的 CSS 处理，实际项目中可以集成 PostCSS
        return css
      } catch (error) {
        console.error(`Failed to load CSS file ${id}:`, error)
        return null
      }
    },
    transform(code: string, id: string): TransformResult | null {
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

      return {
        code: jsCode,
        map: null,
      }
    },
  }
}

/**
 * 静态资源处理插件
 */
export function assetPlugin(publicDir: string): Plugin {
  return {
    name: 'asset',
    async load(id: string) {
      if (!isStaticAsset(id)) return null

      // 返回资源的 URL
      const url = id.startsWith('/') ? id : `/${id}`
      return `export default ${JSON.stringify(url)}`
    },
  }
}

/**
 * HTML 处理插件
 */
export function htmlPlugin(): Plugin {
  return {
    name: 'html',
    async load(id: string) {
      if (!id.endsWith('.html')) return null

      try {
        let html = await readFile(id)

        // 注入 HMR 客户端代码
        if (process.env.NODE_ENV === 'development') {
          const hmrScript = `
<script type="module">
  import { createHotContext } from '/@vite/client';
  const hot = createHotContext('/');
</script>`
          html = html.replace('</head>', `${hmrScript}\n</head>`)
        }

        return html
      } catch (error) {
        console.error(`Failed to load HTML file ${id}:`, error)
        return null
      }
    },
  }
}

/**
 * 导入分析插件
 */
export function importAnalysisPlugin(): Plugin {
  return {
    name: 'import-analysis',
    async transform(code: string, id: string): Promise<TransformResult | null> {
      if (!isJSRequest(id)) return null

      // 使用 es-module-lexer 分析导入
      const { init, parse } = await import('es-module-lexer')
      await init

      try {
        const [imports] = parse(code)
        let s: any

        for (const imp of imports) {
          const { s: start, e: end, n: specifier } = imp

          if (specifier) {
            // 处理裸模块导入
            if (
              !specifier.startsWith('.') &&
              !specifier.startsWith('/') &&
              !specifier.includes('://')
            ) {
              if (!s) {
                const MagicString = (await import('magic-string')).default
                s = new MagicString(code)
              }

              // 重写为预构建的依赖路径
              const rewritten = `/node_modules/.mini-vite/deps/${specifier}.js`
              s.overwrite(start, end, `'${rewritten}'`)
            }
          }
        }

        if (s) {
          return {
            code: s.toString(),
            map: s.generateMap({ hires: true }),
          }
        }
      } catch (error) {
        console.error(`Import analysis error in ${id}:`, error)
      }

      return null
    },
  }
}

/**
 * 默认插件集合
 */
export function createDefaultPlugins(config: any): Plugin[] {
  return [
    aliasPlugin(config.resolve?.alias || {}),
    esbuildPlugin(),
    cssPlugin(),
    assetPlugin(config.publicDir),
    htmlPlugin(),
    importAnalysisPlugin(),
  ]
}

import { createServer, Server } from 'http'
import { WebSocketServer } from 'ws'
import connect from 'connect'
import sirv from 'sirv'
import { resolve, join } from 'path'
import { DevServer, ResolvedConfig, TransformOptions, TransformResult } from '../types/index.js'
import { ModuleGraphImpl } from '../core/moduleGraph.js'
import { DepsOptimizer } from '../deps/optimizer.js'
import { createPluginContainer } from './pluginContainer.js'
import { createHMRServer } from './hmr.js'
import { getPort, colorize, pathExists } from '../utils/index.js'

/**
 * 创建开发服务器
 */
export async function createDevServer(config: ResolvedConfig): Promise<DevServer> {
  const middlewares = connect()
  const moduleGraph = ModuleGraphImpl.create()
  const depsOptimizer = new DepsOptimizer(config)
  const pluginContainer = await createPluginContainer(config, moduleGraph)

  // 运行依赖优化
  await depsOptimizer.run()

  let httpServer: Server | null = null
  let ws: WebSocketServer

  // 创建 WebSocket 服务器用于 HMR
  const hmrPort = await getPort(3001)
  const hmrServer = createHMRServer(hmrPort)
  ws = hmrServer.ws

  // 静态文件服务
  if (await pathExists(config.publicDir)) {
    middlewares.use(
      config.base,
      sirv(config.publicDir, {
        dev: true,
        etag: true,
        extensions: [],
      })
    )
  }

  // 模块转换中间件
  middlewares.use(async (req, res, next) => {
    if (req.method !== 'GET' || !req.url) {
      return next()
    }

    try {
      const url = req.url.split('?')[0]

      // 处理 HMR 客户端
      if (url === '/@vite/client') {
        res.setHeader('Content-Type', 'application/javascript')
        res.end(await getHMRClientCode(hmrPort))
        return
      }

      // 处理模块请求
      const result = await transformRequest(url, { ssr: false })

      if (result) {
        res.setHeader('Content-Type', 'application/javascript')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('ETag', `"${Date.now()}"`)

        if (result.map) {
          const base64Map = Buffer.from(JSON.stringify(result.map)).toString('base64')
          res.end(result.code + `\n//# sourceMappingURL=data:application/json;base64,${base64Map}`)
        } else {
          res.end(result.code)
        }
        return
      }
    } catch (error: any) {
      config.logger.error(`Transform error: ${error.message}`)
      res.statusCode = 500
      res.end(`Transform error: ${error.message}`)
      return
    }

    next()
  })

  // 处理 HTML 文件
  middlewares.use(async (req, res, next) => {
    if (req.url?.endsWith('.html') || req.url === '/') {
      const htmlPath = req.url === '/' ? '/index.html' : req.url
      const filePath = resolve(config.root, htmlPath.slice(1))

      if (await pathExists(filePath)) {
        try {
          const result = await transformRequest(htmlPath)
          if (result) {
            res.setHeader('Content-Type', 'text/html')
            res.end(result.code)
            return
          }
        } catch (error) {
          config.logger.error(`HTML transform error: ${error}`)
        }
      }
    }

    next()
  })

  // 转换请求函数
  async function transformRequest(
    url: string,
    options: TransformOptions = {}
  ): Promise<TransformResult | null> {
    const cleanedUrl = url.split('?')[0]
    let mod = moduleGraph.getModuleByUrl(cleanedUrl)

    if (!mod) {
      mod = moduleGraph.ensureEntryFromUrl(cleanedUrl)
    }

    // 检查缓存
    if (mod.transformResult && !options.ssr) {
      return mod.transformResult
    }

    // 解析模块 ID
    const resolved = await pluginContainer.resolveId(cleanedUrl)
    const id = resolved?.id || cleanedUrl

    // 加载模块
    const loadResult = await pluginContainer.load(id)
    if (!loadResult) {
      return null
    }

    const code = typeof loadResult === 'string' ? loadResult : loadResult.code

    // 转换模块
    const transformResult = await pluginContainer.transform(code, id)

    if (transformResult) {
      mod.transformResult = transformResult
      return transformResult
    }

    return { code, map: null }
  }

  const server: DevServer = {
    config,
    middlewares,
    httpServer,
    ws,
    moduleGraph,
    transformRequest,

    async listen(port?: number, isRestart = false) {
      const resolvedPort = port || config.server.port || 3000
      const finalPort = await getPort(resolvedPort)

      return new Promise((resolve, reject) => {
        httpServer = createServer(middlewares)

        // 将 WebSocket 服务器附加到 HTTP 服务器
        ws.on('connection', (socket) => {
          hmrServer.handleConnection(socket, server)
        })

        httpServer.listen(finalPort, () => {
          const host = config.server.host === true ? 'localhost' : config.server.host || 'localhost'
          const url = `http://${host}:${finalPort}${config.base}`

          if (!isRestart) {
            config.logger.info(`${colorize('green', '➜')} Local:   ${colorize('cyan', url)}`)
            config.logger.info(
              `${colorize('green', '➜')} Network: use ${colorize('cyan', '--host')} to expose`
            )
          }

          resolve(server)
        })

        httpServer.on('error', reject)
      })
    },

    async close() {
      if (httpServer) {
        httpServer.close()
      }
      ws.close()
    },
  }

  // 调用插件的 configureServer 钩子
  for (const plugin of config.plugins) {
    if (plugin.configureServer) {
      await plugin.configureServer(server)
    }
  }

  return server
}

/**
 * 获取 HMR 客户端代码
 */
async function getHMRClientCode(hmrPort = 3001): Promise<string> {
  return `
// HMR Client
console.log('[mini-vite] connecting...');

const socket = new WebSocket('ws://localhost:${hmrPort}');

socket.addEventListener('open', () => {
  console.log('[mini-vite] connected.');
});

socket.addEventListener('message', ({ data }) => {
  const payload = JSON.parse(data);
  
  switch (payload.type) {
    case 'connected':
      console.log('[mini-vite] connected.');
      break;
      
    case 'update':
      payload.updates.forEach(update => {
        if (update.type === 'js-update') {
          updateModule(update.path, update.timestamp);
        } else if (update.type === 'css-update') {
          updateCSS(update.path, update.timestamp);
        }
      });
      break;
      
    case 'full-reload':
      location.reload();
      break;
      
    case 'error':
      console.error('[mini-vite] error:', payload.message);
      break;
  }
});

function updateModule(path, timestamp) {
  const newUrl = path + '?t=' + timestamp;
  import(newUrl).catch(err => {
    console.error('[mini-vite] failed to update module:', err);
    location.reload();
  });
}

function updateCSS(path, timestamp) {
  const links = document.querySelectorAll('link[rel="stylesheet"]');
  links.forEach(link => {
    if (link.href.includes(path)) {
      const newHref = path + '?t=' + timestamp;
      link.href = newHref;
    }
  });
}

export function createHotContext(ownerPath) {
  return {
    accept() {
      // HMR accept logic
    },
    dispose() {
      // HMR dispose logic
    }
  };
}
`
}

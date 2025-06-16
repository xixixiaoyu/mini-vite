import { WebSocketServer, WebSocket } from 'ws'
import chokidar from 'chokidar'
import { DevServer, HMRPayload, Update, HmrContext } from '../types/index.js'
import { normalizePath, colorize } from '../utils/index.js'

/**
 * HMR 服务器
 */
export interface HMRServer {
  ws: WebSocketServer
  handleConnection: (socket: WebSocket, server: DevServer) => void
  send: (payload: HMRPayload) => void
  close: () => void
}

/**
 * 创建 HMR 服务器
 */
export function createHMRServer(port = 3001): HMRServer {
  const ws = new WebSocketServer({ port })
  const clients = new Set<WebSocket>()

  function send(payload: HMRPayload) {
    const message = JSON.stringify(payload)
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message)
      }
    })
  }

  function handleConnection(socket: WebSocket, server: DevServer) {
    clients.add(socket)

    socket.on('close', () => {
      clients.delete(socket)
    })

    // 发送连接确认
    socket.send(JSON.stringify({ type: 'connected' }))

    // 设置文件监听
    setupFileWatcher(server, send)
  }

  function close() {
    clients.forEach((client) => client.close())
    ws.close()
  }

  return {
    ws,
    handleConnection,
    send,
    close,
  }
}

/**
 * 设置文件监听器
 */
function setupFileWatcher(server: DevServer, send: (payload: HMRPayload) => void) {
  const { config, moduleGraph } = server

  const watcher = chokidar.watch(
    [
      config.root + '/**/*',
      '!' + config.root + '/node_modules/**',
      '!' + config.root + '/dist/**',
      '!' + config.root + '/.git/**',
    ],
    {
      ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
      ignoreInitial: true,
    }
  )

  watcher.on('change', async (file) => {
    const normalizedFile = normalizePath(file)
    config.logger.info(`${colorize('green', 'hmr update')} ${normalizedFile}`)

    try {
      await handleFileChange(normalizedFile, server, send)
    } catch (error) {
      config.logger.error(`HMR update error: ${error}`)
      send({
        type: 'error',
        message: `HMR update failed: ${error}`,
      })
    }
  })

  watcher.on('add', async (file) => {
    const normalizedFile = normalizePath(file)
    config.logger.info(`${colorize('green', 'hmr add')} ${normalizedFile}`)

    // 新文件添加时，可能需要全量刷新
    send({ type: 'full-reload' })
  })

  watcher.on('unlink', async (file) => {
    const normalizedFile = normalizePath(file)
    config.logger.info(`${colorize('red', 'hmr remove')} ${normalizedFile}`)

    // 文件删除时，通常需要全量刷新
    send({ type: 'full-reload' })
  })
}

/**
 * 处理文件变更
 */
async function handleFileChange(
  file: string,
  server: DevServer,
  send: (payload: HMRPayload) => void
) {
  const { moduleGraph, config } = server
  const timestamp = Date.now()

  // 更新模块图
  moduleGraph.onFileChange(file)

  // 获取受影响的模块
  const mods = moduleGraph.getModulesByFile(file)
  if (!mods || mods.size === 0) {
    // 如果没有找到相关模块，可能是新文件或配置文件
    send({ type: 'full-reload' })
    return
  }

  const updates: Update[] = []

  for (const mod of mods) {
    // 创建 HMR 上下文
    const hmrContext: HmrContext = {
      file,
      timestamp,
      modules: Array.from(mods),
      read: () => server.transformRequest(mod.id).then((r) => r?.code || ''),
      server,
    }

    // 调用插件的 handleHotUpdate 钩子
    let shouldFullReload = false

    for (const plugin of config.plugins) {
      if (plugin.handleHotUpdate) {
        try {
          await plugin.handleHotUpdate(hmrContext)
        } catch (error) {
          config.logger.error(`Plugin ${plugin.name} handleHotUpdate error:`, error)
          shouldFullReload = true
          break
        }
      }
    }

    if (shouldFullReload) {
      send({ type: 'full-reload' })
      return
    }

    // 确定更新类型
    const updateType = getUpdateType(mod.id)

    updates.push({
      type: updateType,
      path: mod.id,
      acceptedPath: mod.id,
      timestamp,
    })
  }

  if (updates.length > 0) {
    send({
      type: 'update',
      updates,
    })
  } else {
    send({ type: 'full-reload' })
  }
}

/**
 * 获取更新类型
 */
function getUpdateType(id: string): 'js-update' | 'css-update' {
  if (id.endsWith('.css') || id.endsWith('.scss') || id.endsWith('.less')) {
    return 'css-update'
  }
  return 'js-update'
}

/**
 * 检查模块是否接受 HMR
 */
function isHMRAccepted(mod: any): boolean {
  return mod.isSelfAccepting || mod.acceptedHmrDeps.size > 0
}

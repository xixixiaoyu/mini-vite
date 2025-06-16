#!/usr/bin/env node

import { program } from 'commander'
import { resolveConfig, createDevServer, build } from '../dist/index.js'
import { colorize } from '../dist/utils/index.js'
import { promises as fs } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(await fs.readFile(join(__dirname, '../package.json'), 'utf-8'))

program.name('mini-vite').description('A lightweight Vite-like build tool').version(pkg.version)

// 开发服务器命令
program
  .command('dev')
  .alias('serve')
  .description('Start development server')
  .option('-p, --port <port>', 'Port to run the server on', '3000')
  .option('-h, --host <host>', 'Host to run the server on', 'localhost')
  .option('--open', 'Open browser on server start')
  .option('-c, --config <file>', 'Use specified config file')
  .action(async (options) => {
    try {
      const config = await resolveConfig(
        {
          server: {
            port: parseInt(options.port),
            host: options.host,
            open: options.open,
          },
        },
        'serve',
        'development'
      )

      const server = await createDevServer(config)
      await server.listen()

      process.on('SIGTERM', () => server.close())
      process.on('SIGINT', () => server.close())
    } catch (error) {
      console.error(colorize('red', 'Failed to start dev server:'), error)
      process.exit(1)
    }
  })

// 构建命令
program
  .command('build')
  .description('Build for production')
  .option('-o, --outDir <dir>', 'Output directory', 'dist')
  .option('--sourcemap', 'Generate sourcemap')
  .option('--minify', 'Minify output')
  .option('-c, --config <file>', 'Use specified config file')
  .action(async (options) => {
    try {
      const config = await resolveConfig(
        {
          build: {
            outDir: options.outDir,
            sourcemap: options.sourcemap,
            minify: options.minify,
          },
        },
        'build',
        'production'
      )

      await build(config)
    } catch (error) {
      console.error(colorize('red', 'Build failed:'), error)
      process.exit(1)
    }
  })

// 预览命令
program
  .command('preview')
  .description('Preview production build')
  .option('-p, --port <port>', 'Port to run the server on', '4173')
  .option('-h, --host <host>', 'Host to run the server on', 'localhost')
  .option('--open', 'Open browser on server start')
  .action(async (options) => {
    try {
      const { createPreviewServer } = await import('../dist/preview/index.js')

      const config = await resolveConfig(
        {
          server: {
            port: parseInt(options.port),
            host: options.host,
            open: options.open,
          },
        },
        'serve',
        'production'
      )

      const server = await createPreviewServer(config)
      await server.listen()

      process.on('SIGTERM', () => server.close())
      process.on('SIGINT', () => server.close())
    } catch (error) {
      console.error(colorize('red', 'Failed to start preview server:'), error)
      process.exit(1)
    }
  })

program.parse()

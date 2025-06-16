import { resolve, join, dirname } from 'path'
import { build } from 'esbuild'
import { promises as fs } from 'fs'
import { ResolvedConfig } from '../types/index.js'
import { ensureDir, pathExists, Timer, colorize } from '../utils/index.js'

/**
 * 依赖优化器
 */
export class DepsOptimizer {
  private config: ResolvedConfig
  private cacheDir: string
  private metadataPath: string
  private metadata: DepMetadata = { hash: '', optimized: {} }

  constructor(config: ResolvedConfig) {
    this.config = config
    this.cacheDir = resolve(config.root, 'node_modules/.mini-vite')
    this.metadataPath = join(this.cacheDir, '_metadata.json')
  }

  /**
   * 运行依赖优化
   */
  async run(): Promise<void> {
    const timer = new Timer()

    // 检查是否需要重新构建
    const needsRebuild = await this.needsRebuild()

    if (!needsRebuild) {
      this.config.logger.info('Dependencies are up to date, skipping optimization')
      return
    }

    this.config.logger.info('Optimizing dependencies...')

    // 扫描依赖
    const deps = await this.scanDependencies()

    if (deps.size === 0) {
      this.config.logger.info('No dependencies to optimize')
      return
    }

    // 预构建依赖
    await this.buildDependencies(deps)

    // 保存元数据
    await this.saveMetadata(deps)

    timer.stopAndLog(colorize('green', '✓ Dependencies optimized'))
  }

  /**
   * 检查是否需要重新构建
   */
  private async needsRebuild(): Promise<boolean> {
    try {
      if (!(await pathExists(this.metadataPath))) {
        return true
      }

      const metadata = JSON.parse(await fs.readFile(this.metadataPath, 'utf-8'))
      this.metadata = metadata

      // 检查 package.json 是否有变化
      const packageJsonPath = resolve(this.config.root, 'package.json')
      if (await pathExists(packageJsonPath)) {
        const packageJson = await fs.readFile(packageJsonPath, 'utf-8')
        const currentHash = this.createHash(packageJson)

        if (currentHash !== metadata.hash) {
          return true
        }
      }

      // 检查优化的文件是否存在
      for (const [dep, info] of Object.entries(metadata.optimized)) {
        if (!(await pathExists((info as DepInfo).file))) {
          return true
        }
      }

      return false
    } catch {
      return true
    }
  }

  /**
   * 扫描依赖
   */
  private async scanDependencies(): Promise<Set<string>> {
    const deps = new Set<string>()
    const { entries } = this.config.optimizeDeps

    // 扫描入口文件
    for (const entry of entries) {
      const entryPath = resolve(this.config.root, entry)
      if (await pathExists(entryPath)) {
        await this.scanFile(entryPath, deps)
      }
    }

    // 过滤排除的依赖
    const { exclude, include } = this.config.optimizeDeps

    // 添加明确包含的依赖
    include.forEach((dep) => deps.add(dep))

    // 移除排除的依赖
    exclude.forEach((dep) => deps.delete(dep))

    return deps
  }

  /**
   * 扫描单个文件的依赖
   */
  private async scanFile(filePath: string, deps: Set<string>): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8')

      // 使用 es-module-lexer 解析导入
      const { init, parse } = await import('es-module-lexer')
      await init

      const [imports] = parse(content)

      for (const imp of imports) {
        const { n: specifier } = imp

        if (specifier && this.isBareImport(specifier)) {
          deps.add(specifier)
        }
      }
    } catch (error) {
      this.config.logger.warn(`Failed to scan ${filePath}: ${error}`)
    }
  }

  /**
   * 判断是否为裸模块导入
   */
  private isBareImport(specifier: string): boolean {
    return (
      !specifier.startsWith('.') &&
      !specifier.startsWith('/') &&
      !specifier.includes('://') &&
      !specifier.startsWith('#')
    )
  }

  /**
   * 构建依赖
   */
  private async buildDependencies(deps: Set<string>): Promise<void> {
    const depsDir = join(this.cacheDir, 'deps')
    await ensureDir(depsDir)

    const entryPoints: Record<string, string> = {}

    // 为每个依赖创建入口点
    for (const dep of deps) {
      try {
        const resolved = require.resolve(dep, { paths: [this.config.root] })
        entryPoints[dep] = resolved
      } catch (error) {
        this.config.logger.warn(`Failed to resolve dependency: ${dep}`)
      }
    }

    if (Object.keys(entryPoints).length === 0) {
      return
    }

    // 使用 esbuild 构建
    try {
      await build({
        entryPoints,
        bundle: true,
        format: 'esm',
        target: 'es2020',
        outdir: depsDir,
        splitting: true,
        sourcemap: true,
        metafile: true,
        define: {
          'process.env.NODE_ENV': JSON.stringify(this.config.mode),
        },
        ...this.config.optimizeDeps.esbuildOptions,
      })

      this.config.logger.info(`Pre-bundled ${deps.size} dependencies`)
    } catch (error) {
      this.config.logger.error('Failed to build dependencies:', error)
      throw error
    }
  }

  /**
   * 保存元数据
   */
  private async saveMetadata(deps: Set<string>): Promise<void> {
    const packageJsonPath = resolve(this.config.root, 'package.json')
    let hash = ''

    if (await pathExists(packageJsonPath)) {
      const packageJson = await fs.readFile(packageJsonPath, 'utf-8')
      hash = this.createHash(packageJson)
    }

    const optimized: Record<string, DepInfo> = {}
    const depsDir = join(this.cacheDir, 'deps')

    for (const dep of deps) {
      optimized[dep] = {
        file: join(depsDir, `${dep}.js`),
        src: dep,
        needsInterop: false,
      }
    }

    const metadata: DepMetadata = {
      hash,
      optimized,
    }

    await ensureDir(dirname(this.metadataPath))
    await fs.writeFile(this.metadataPath, JSON.stringify(metadata, null, 2))
  }

  /**
   * 创建哈希
   */
  private createHash(content: string): string {
    const crypto = require('crypto')
    return crypto.createHash('md5').update(content).digest('hex')
  }

  /**
   * 获取优化后的依赖信息
   */
  getOptimizedDep(id: string): DepInfo | undefined {
    return this.metadata.optimized[id]
  }
}

// 类型定义
interface DepMetadata {
  hash: string
  optimized: Record<string, DepInfo>
}

interface DepInfo {
  file: string
  src: string
  needsInterop: boolean
}

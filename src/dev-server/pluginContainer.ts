import { resolve, dirname, extname } from 'path';
import { ResolvedConfig, Plugin, TransformResult, ModuleGraph } from '../types/index.js';
import { pathExists, readFile, normalizePath } from '../utils/index.js';

/**
 * 插件容器 - 管理和执行插件钩子
 */
export class PluginContainer {
  private config: ResolvedConfig;
  private plugins: Plugin[];
  private moduleGraph: ModuleGraph;

  constructor(config: ResolvedConfig, moduleGraph: ModuleGraph) {
    this.config = config;
    this.plugins = config.plugins;
    this.moduleGraph = moduleGraph;
  }

  /**
   * 解析模块 ID
   */
  async resolveId(id: string, importer?: string): Promise<{ id: string } | null> {
    // 处理绝对路径
    if (id.startsWith('/')) {
      const fullPath = resolve(this.config.root, id.slice(1));
      if (await pathExists(fullPath)) {
        return { id: fullPath };
      }
    }

    // 处理相对路径
    if (id.startsWith('.') && importer) {
      const fullPath = resolve(dirname(importer), id);
      if (await pathExists(fullPath)) {
        return { id: fullPath };
      }
      
      // 尝试添加扩展名
      const extensions = ['.js', '.ts', '.jsx', '.tsx', '.json'];
      for (const ext of extensions) {
        const pathWithExt = fullPath + ext;
        if (await pathExists(pathWithExt)) {
          return { id: pathWithExt };
        }
      }
    }

    // 调用插件的 resolveId 钩子
    for (const plugin of this.plugins) {
      if (plugin.resolveId) {
        const result = await plugin.resolveId(id, importer);
        if (result) {
          return { id: result };
        }
      }
    }

    return null;
  }

  /**
   * 加载模块
   */
  async load(id: string): Promise<string | { code: string; map?: string } | null> {
    // 调用插件的 load 钩子
    for (const plugin of this.plugins) {
      if (plugin.load) {
        const result = await plugin.load(id);
        if (result !== null) {
          return result;
        }
      }
    }

    // 默认文件系统加载
    try {
      if (await pathExists(id)) {
        const code = await readFile(id);
        return code;
      }
    } catch (error) {
      this.config.logger.error(`Failed to load ${id}: ${error}`);
    }

    return null;
  }

  /**
   * 转换模块
   */
  async transform(code: string, id: string): Promise<TransformResult | null> {
    let result: TransformResult = { code, map: null };

    // 依次调用插件的 transform 钩子
    for (const plugin of this.plugins) {
      if (plugin.transform) {
        const transformResult = await plugin.transform(result.code, id);
        if (transformResult) {
          result = transformResult;
        }
      }
    }

    return result.code !== code ? result : null;
  }

  /**
   * 构建开始钩子
   */
  async buildStart(opts: any): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.buildStart) {
        await plugin.buildStart(opts);
      }
    }
  }

  /**
   * 生成 bundle 钩子
   */
  async generateBundle(opts: any, bundle: any): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.generateBundle) {
        await plugin.generateBundle(opts, bundle);
      }
    }
  }

  /**
   * 写入 bundle 钩子
   */
  async writeBundle(opts: any, bundle: any): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.writeBundle) {
        await plugin.writeBundle(opts, bundle);
      }
    }
  }
}

/**
 * 创建插件容器
 */
export async function createPluginContainer(
  config: ResolvedConfig,
  moduleGraph: ModuleGraph
): Promise<PluginContainer> {
  const container = new PluginContainer(config, moduleGraph);
  
  // 调用插件的 buildStart 钩子
  await container.buildStart({});
  
  return container;
}

// 主入口文件
export { createDevServer } from './dev-server/index.js';
export { build } from './build/index.js';
export { resolveConfig, defineConfig } from './core/config.js';
export { createLogger } from './core/logger.js';
export { ModuleGraphImpl } from './core/moduleGraph.js';
export { DepsOptimizer } from './deps/optimizer.js';

// 插件
export {
  aliasPlugin,
  esbuildPlugin,
  cssPlugin,
  assetPlugin,
  htmlPlugin,
  importAnalysisPlugin,
  createDefaultPlugins,
} from './plugins/index.js';

// 类型
export type {
  MiniViteConfig,
  ResolvedConfig,
  Plugin,
  DevServer,
  BuildOptions,
  ServerOptions,
  HMROptions,
  OptimizeDepsOptions,
  TransformResult,
  ModuleGraph,
  ModuleNode,
  Logger,
} from './types/index.js';

// 工具函数
export {
  normalizePath,
  isAbsolute,
  cleanUrl,
  removeTimestampQuery,
  ensureDir,
  pathExists,
  readFile,
  writeFile,
  isJSRequest,
  isCSSRequest,
  isImportRequest,
  isStaticAsset,
  getTimestamp,
  BuildError,
  createDebugger,
  colors,
  colorize,
  Timer,
  deepMerge,
  getPort,
} from './utils/index.js';

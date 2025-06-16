import { resolve, join } from 'path';
import { pathExists, readFile, deepMerge } from '../utils/index.js';
import { MiniViteConfig, ResolvedConfig, Logger } from '../types/index.js';
import { createLogger } from './logger.js';

// 默认配置
const DEFAULT_CONFIG: MiniViteConfig = {
  root: process.cwd(),
  base: '/',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'esbuild',
    target: 'modules',
  },
  server: {
    host: 'localhost',
    port: 3000,
    https: false,
    open: false,
    cors: true,
    hmr: true,
  },
  plugins: [],
  optimizeDeps: {
    entries: ['index.html'],
    exclude: [],
    include: [],
  },
};

/**
 * 解析配置文件
 */
export async function resolveConfig(
  inlineConfig: MiniViteConfig = {},
  command: 'build' | 'serve' = 'serve',
  mode = 'development'
): Promise<ResolvedConfig> {
  const root = resolve(inlineConfig.root || process.cwd());
  
  // 查找配置文件
  const configFile = await findConfigFile(root);
  let fileConfig: MiniViteConfig = {};
  
  if (configFile) {
    try {
      fileConfig = await loadConfigFile(configFile);
    } catch (error) {
      console.warn(`Failed to load config file: ${configFile}`, error);
    }
  }
  
  // 合并配置
  const mergedConfig = deepMerge(
    deepMerge(DEFAULT_CONFIG, fileConfig),
    inlineConfig
  );
  
  // 解析环境变量
  const env = loadEnv(mode, root);
  
  // 创建日志器
  const logger = createLogger();
  
  // 构建最终配置
  const resolved: ResolvedConfig = {
    ...mergedConfig,
    command,
    mode,
    isProduction: command === 'build',
    env,
    logger,
    root,
    base: mergedConfig.base!,
    publicDir: resolve(root, mergedConfig.publicDir!),
    build: {
      ...mergedConfig.build!,
      outDir: resolve(root, mergedConfig.build!.outDir!),
    },
    server: {
      ...mergedConfig.server!,
    },
    plugins: mergedConfig.plugins!,
    optimizeDeps: {
      ...mergedConfig.optimizeDeps!,
    },
  };
  
  // 调用插件的 configResolved 钩子
  for (const plugin of resolved.plugins) {
    if (plugin.configResolved) {
      await plugin.configResolved(resolved);
    }
  }
  
  return resolved;
}

/**
 * 查找配置文件
 */
async function findConfigFile(root: string): Promise<string | null> {
  const configFiles = [
    'mini-vite.config.js',
    'mini-vite.config.ts',
    'mini-vite.config.mjs',
  ];
  
  for (const file of configFiles) {
    const configPath = join(root, file);
    if (await pathExists(configPath)) {
      return configPath;
    }
  }
  
  return null;
}

/**
 * 加载配置文件
 */
async function loadConfigFile(configPath: string): Promise<MiniViteConfig> {
  try {
    // 对于 TypeScript 配置文件，需要先编译
    if (configPath.endsWith('.ts')) {
      const { build } = await import('esbuild');
      const result = await build({
        entryPoints: [configPath],
        outfile: configPath.replace('.ts', '.mjs'),
        format: 'esm',
        platform: 'node',
        write: false,
        bundle: true,
        external: ['esbuild'],
      });
      
      const code = result.outputFiles[0].text;
      const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
      const module = await import(dataUrl);
      return module.default || module;
    }
    
    // 直接导入 JS/MJS 文件
    const module = await import(`file://${configPath}`);
    return module.default || module;
  } catch (error) {
    throw new Error(`Failed to load config file ${configPath}: ${error}`);
  }
}

/**
 * 加载环境变量
 */
function loadEnv(mode: string, root: string): Record<string, any> {
  const env: Record<string, any> = {};
  
  // 加载 .env 文件
  const envFiles = [
    `.env`,
    `.env.local`,
    `.env.${mode}`,
    `.env.${mode}.local`,
  ];
  
  for (const file of envFiles) {
    const envPath = join(root, file);
    try {
      const content = require('fs').readFileSync(envPath, 'utf-8');
      const lines = content.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key) {
            env[key.trim()] = valueParts.join('=').trim();
          }
        }
      }
    } catch {
      // 文件不存在或读取失败，忽略
    }
  }
  
  // 添加 NODE_ENV
  env.NODE_ENV = mode === 'development' ? 'development' : 'production';
  env.MODE = mode;
  
  return env;
}

/**
 * 定义配置的辅助函数
 */
export function defineConfig(config: MiniViteConfig): MiniViteConfig {
  return config;
}

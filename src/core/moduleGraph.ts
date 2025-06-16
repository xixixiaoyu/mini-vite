import { ModuleGraph, ModuleNode } from '../types/index.js';
import { cleanUrl, normalizePath } from '../utils/index.js';

/**
 * 模块节点实现
 */
export class ModuleNodeImpl implements ModuleNode {
  id: string;
  file: string | null = null;
  importers = new Set<ModuleNode>();
  importedModules = new Set<ModuleNode>();
  acceptedHmrDeps = new Set<ModuleNode>();
  isSelfAccepting = false;
  transformResult: any = null;
  ssrTransformResult: any = null;
  lastHMRTimestamp = 0;

  constructor(id: string) {
    this.id = id;
  }
}

/**
 * 模块图实现
 */
export class ModuleGraphImpl implements ModuleGraph {
  urlToModuleMap = new Map<string, ModuleNode>();
  idToModuleMap = new Map<string, ModuleNode>();
  fileToModulesMap = new Map<string, Set<ModuleNode>>();
  safeModulesPath = new Set<string>();

  constructor() {}

  getModuleByUrl(rawUrl: string): ModuleNode | undefined {
    const url = cleanUrl(rawUrl);
    return this.urlToModuleMap.get(url);
  }

  getModuleById(id: string): ModuleNode | undefined {
    return this.idToModuleMap.get(id);
  }

  getModulesByFile(file: string): Set<ModuleNode> | undefined {
    return this.fileToModulesMap.get(file);
  }

  onFileChange(file: string): void {
    const mods = this.getModulesByFile(file);
    if (mods) {
      const timestamp = Date.now();
      mods.forEach(mod => {
        this.invalidateModule(mod);
        mod.lastHMRTimestamp = timestamp;
      });
    }
  }

  invalidateModule(mod: ModuleNode): void {
    // 清除转换结果
    mod.transformResult = null;
    mod.ssrTransformResult = null;
    
    // 递归失效依赖此模块的模块
    mod.importers.forEach(importer => {
      if (!importer.acceptedHmrDeps.has(mod) && !importer.isSelfAccepting) {
        this.invalidateModule(importer);
      }
    });
  }

  invalidateAll(): void {
    this.urlToModuleMap.forEach(mod => {
      this.invalidateModule(mod);
    });
  }

  updateModuleInfo(
    mod: ModuleNode,
    importedModules: Set<string | ModuleNode>
  ): void {
    const prevImports = mod.importedModules;
    const nextImports = new Set<ModuleNode>();

    // 处理新的导入
    for (const imported of importedModules) {
      const dep = typeof imported === 'string' 
        ? this.ensureEntryFromUrl(imported)
        : imported;
      
      dep.importers.add(mod);
      nextImports.add(dep);
    }

    // 清理旧的导入关系
    prevImports.forEach(dep => {
      if (!nextImports.has(dep)) {
        dep.importers.delete(mod);
      }
    });

    mod.importedModules = nextImports;
  }

  ensureEntryFromUrl(rawUrl: string): ModuleNode {
    const url = cleanUrl(rawUrl);
    let mod = this.urlToModuleMap.get(url);
    
    if (!mod) {
      mod = new ModuleNodeImpl(url);
      this.urlToModuleMap.set(url, mod);
      this.idToModuleMap.set(url, mod);
      
      // 如果是文件路径，添加到文件映射
      if (url.startsWith('/') || url.includes('://')) {
        const file = normalizePath(url);
        let fileMods = this.fileToModulesMap.get(file);
        if (!fileMods) {
          fileMods = new Set();
          this.fileToModulesMap.set(file, fileMods);
        }
        fileMods.add(mod);
        mod.file = file;
      }
    }
    
    return mod;
  }

  /**
   * 创建模块图实例
   */
  static create(): ModuleGraph {
    return new ModuleGraphImpl();
  }
}

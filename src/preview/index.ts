import { createServer } from 'http';
import connect from 'connect';
import sirv from 'sirv';
import { resolve } from 'path';
import { ResolvedConfig } from '../types/index.js';
import { getPort, colorize, pathExists } from '../utils/index.js';

/**
 * 创建预览服务器
 */
export async function createPreviewServer(config: ResolvedConfig) {
  const middlewares = connect();
  
  // 检查构建目录是否存在
  if (!(await pathExists(config.build.outDir))) {
    throw new Error(`Build directory ${config.build.outDir} does not exist. Run 'mini-vite build' first.`);
  }
  
  // 静态文件服务
  middlewares.use(
    config.base,
    sirv(config.build.outDir, {
      etag: true,
      maxAge: 31536000, // 1 year
      immutable: true,
    })
  );
  
  // SPA 回退
  middlewares.use((req, res, next) => {
    if (req.method === 'GET' && !req.url?.includes('.')) {
      const indexPath = resolve(config.build.outDir, 'index.html');
      res.setHeader('Content-Type', 'text/html');
      require('fs').createReadStream(indexPath).pipe(res);
    } else {
      next();
    }
  });
  
  return {
    async listen(port?: number) {
      const resolvedPort = port || config.server.port || 4173;
      const finalPort = await getPort(resolvedPort);
      
      return new Promise((resolve, reject) => {
        const httpServer = createServer(middlewares);
        
        httpServer.listen(finalPort, () => {
          const host = config.server.host === true ? 'localhost' : (config.server.host || 'localhost');
          const url = `http://${host}:${finalPort}${config.base}`;
          
          config.logger.info(`${colorize('green', '➜')} Local:   ${colorize('cyan', url)}`);
          config.logger.info(`${colorize('green', '➜')} Network: use ${colorize('cyan', '--host')} to expose`);
          
          resolve({ httpServer, port: finalPort });
        });
        
        httpServer.on('error', reject);
      });
    },
    
    close() {
      // 关闭服务器的逻辑
    }
  };
}

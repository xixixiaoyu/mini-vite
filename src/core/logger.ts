import { Logger } from '../types/index.js';
import { colors, colorize } from '../utils/index.js';

/**
 * 创建日志器
 */
export function createLogger(level: 'silent' | 'error' | 'warn' | 'info' = 'info'): Logger {
  const logLevel = getLogLevel(level);
  
  function output(type: 'info' | 'warn' | 'error', msg: string, options: any = {}) {
    if (getLogLevel(type) < logLevel) return;
    
    const method = type === 'info' ? 'log' : type;
    const format = () => {
      const timestamp = new Date().toLocaleTimeString();
      const prefix = options.timestamp !== false ? `${colorize('dim', timestamp)} ` : '';
      
      switch (type) {
        case 'info':
          return `${prefix}${colorize('cyan', '[mini-vite]')} ${msg}`;
        case 'warn':
          return `${prefix}${colorize('yellow', '[mini-vite]')} ${colorize('yellow', 'warning:')} ${msg}`;
        case 'error':
          return `${prefix}${colorize('red', '[mini-vite]')} ${colorize('red', 'error:')} ${msg}`;
        default:
          return msg;
      }
    };
    
    console[method](format());
  }
  
  const logger: Logger = {
    info(msg: string, opts?: any) {
      output('info', msg, opts);
    },
    warn(msg: string, opts?: any) {
      output('warn', msg, opts);
    },
    error(msg: string, opts?: any) {
      output('error', msg, opts);
    },
    clearScreen(type: string) {
      if (type === 'error') {
        console.clear();
        console.log(colorize('red', '❌ Build failed'));
      } else {
        console.clear();
      }
    }
  };
  
  return logger;
}

function getLogLevel(level: string): number {
  switch (level) {
    case 'silent': return 0;
    case 'error': return 1;
    case 'warn': return 2;
    case 'info': return 3;
    default: return 3;
  }
}

import { createCounter } from './counter.js';
import { formatMessage } from './utils.js';
import './style.css';

console.log('Mini Vite is running!');

// 创建计数器
const counter = createCounter();
const button = document.getElementById('counter-btn');
const moduleInfo = document.getElementById('module-info');

if (button) {
  button.addEventListener('click', () => {
    counter.increment();
    button.textContent = `Count: ${counter.getValue()}`;
  });
}

// 显示模块信息
if (moduleInfo) {
  moduleInfo.innerHTML = formatMessage('Module loaded successfully!');
}

// HMR 支持
if (import.meta.hot) {
  import.meta.hot.accept('./counter.js', (newModule) => {
    console.log('Counter module updated!');
  });
  
  import.meta.hot.accept('./utils.js', (newModule) => {
    console.log('Utils module updated!');
  });
}

/**
 * 全局 fetch 代理配置
 *
 * Node 内置 fetch (undici) 默认不走 HTTP_PROXY 环境变量。
 * 通过 setGlobalDispatcher(ProxyAgent) 让所有 fetch() 调用走代理。
 *
 * 读取顺序 (大小写不敏感,首个非空生效):
 *   1. HTTPS_PROXY
 *   2. HTTP_PROXY
 *   3. ALL_PROXY
 *
 * 用法: 只需在应用入口 import 一次即可生效:
 *   import '@/lib/ai/proxy';
 *
 * 模块级副作用,只会真正 setGlobalDispatcher 一次 (process 生命周期内)。
 */
import { ProxyAgent, setGlobalDispatcher, getGlobalDispatcher } from 'undici';

let installed = false;

function readProxyEnv(): string | null {
  const env = process.env;
  return (
    env.HTTPS_PROXY ??
    env.https_proxy ??
    env.HTTP_PROXY ??
    env.http_proxy ??
    env.ALL_PROXY ??
    env.all_proxy ??
    null
  );
}

export function installProxy(): void {
  if (installed) return;
  installed = true;

  const proxy = readProxyEnv();
  if (!proxy) {
    return; // 未配置代理,保留默认 dispatcher
  }
  try {
    const dispatcher = new ProxyAgent({ uri: proxy });
    setGlobalDispatcher(dispatcher);
    // 避免重复设置时报错
  } catch {
    // ignore - 保留默认 dispatcher
  }
}

// 模块加载时自动安装 (副作用)
installProxy();

// 导出供测试 / 调试使用
export { readProxyEnv, getGlobalDispatcher };

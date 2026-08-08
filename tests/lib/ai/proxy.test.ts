import { describe, it, expect } from 'vitest';
import { readProxyEnv } from '@/lib/ai/proxy';

describe('ai/proxy', () => {
  it('readProxyEnv 优先 HTTPS_PROXY', () => {
    const prev = {
      HTTPS_PROXY: process.env.HTTPS_PROXY,
      https_proxy: process.env.https_proxy,
      HTTP_PROXY: process.env.HTTP_PROXY,
      http_proxy: process.env.http_proxy,
      ALL_PROXY: process.env.ALL_PROXY,
      all_proxy: process.env.all_proxy,
    };
    try {
      process.env.HTTPS_PROXY = 'http://a:1';
      process.env.HTTP_PROXY = 'http://b:2';
      expect(readProxyEnv()).toBe('http://a:1');
    } finally {
      process.env.HTTPS_PROXY = prev.HTTPS_PROXY;
      process.env.https_proxy = prev.https_proxy;
      process.env.HTTP_PROXY = prev.HTTP_PROXY;
      process.env.http_proxy = prev.http_proxy;
      process.env.ALL_PROXY = prev.ALL_PROXY;
      process.env.all_proxy = prev.all_proxy;
    }
  });

  it('readProxyEnv 回退到 HTTP_PROXY', () => {
    const prev = {
      HTTPS_PROXY: process.env.HTTPS_PROXY,
      https_proxy: process.env.https_proxy,
      HTTP_PROXY: process.env.HTTP_PROXY,
      http_proxy: process.env.http_proxy,
      ALL_PROXY: process.env.ALL_PROXY,
      all_proxy: process.env.all_proxy,
    };
    try {
      delete process.env.HTTPS_PROXY;
      delete process.env.https_proxy;
      process.env.HTTP_PROXY = 'http://b:2';
      expect(readProxyEnv()).toBe('http://b:2');
    } finally {
      process.env.HTTPS_PROXY = prev.HTTPS_PROXY;
      process.env.https_proxy = prev.https_proxy;
      process.env.HTTP_PROXY = prev.HTTP_PROXY;
      process.env.http_proxy = prev.http_proxy;
      process.env.ALL_PROXY = prev.ALL_PROXY;
      process.env.all_proxy = prev.all_proxy;
    }
  });

  it('readProxyEnv 回退到 ALL_PROXY', () => {
    const prev = {
      HTTPS_PROXY: process.env.HTTPS_PROXY,
      https_proxy: process.env.https_proxy,
      HTTP_PROXY: process.env.HTTP_PROXY,
      http_proxy: process.env.http_proxy,
      ALL_PROXY: process.env.ALL_PROXY,
      all_proxy: process.env.all_proxy,
    };
    try {
      delete process.env.HTTPS_PROXY;
      delete process.env.https_proxy;
      delete process.env.HTTP_PROXY;
      delete process.env.http_proxy;
      process.env.ALL_PROXY = 'http://c:3';
      expect(readProxyEnv()).toBe('http://c:3');
    } finally {
      process.env.HTTPS_PROXY = prev.HTTPS_PROXY;
      process.env.https_proxy = prev.https_proxy;
      process.env.HTTP_PROXY = prev.HTTP_PROXY;
      process.env.http_proxy = prev.http_proxy;
      process.env.ALL_PROXY = prev.ALL_PROXY;
      process.env.all_proxy = prev.all_proxy;
    }
  });

  it('readProxyEnv 未配置返回 null', () => {
    const prev = {
      HTTPS_PROXY: process.env.HTTPS_PROXY,
      https_proxy: process.env.https_proxy,
      HTTP_PROXY: process.env.HTTP_PROXY,
      http_proxy: process.env.http_proxy,
      ALL_PROXY: process.env.ALL_PROXY,
      all_proxy: process.env.all_proxy,
    };
    try {
      delete process.env.HTTPS_PROXY;
      delete process.env.https_proxy;
      delete process.env.HTTP_PROXY;
      delete process.env.http_proxy;
      delete process.env.ALL_PROXY;
      delete process.env.all_proxy;
      expect(readProxyEnv()).toBeNull();
    } finally {
      process.env.HTTPS_PROXY = prev.HTTPS_PROXY;
      process.env.https_proxy = prev.https_proxy;
      process.env.HTTP_PROXY = prev.HTTP_PROXY;
      process.env.http_proxy = prev.http_proxy;
      process.env.ALL_PROXY = prev.ALL_PROXY;
      process.env.all_proxy = prev.all_proxy;
    }
  });
});

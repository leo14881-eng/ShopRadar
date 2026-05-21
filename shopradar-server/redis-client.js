'use strict';

/**
 * Redis 客户端 — 飙升榜缓存（必填）
 * 环境变量 REDIS_URL（默认 redis://127.0.0.1:6379）
 * 未安装 redis 包或连接失败时，服务启动失败 / API 返回 503
 */

const TRENDING_CACHE_KEY = 'shopradar:trending:v1';
const TRENDING_CACHE_TTL_SEC = Number(process.env.TRENDING_CACHE_TTL_SEC) || 600;

let redisModule;
try {
  redisModule = require('redis');
} catch (requireErr) {
  throw new Error(
    '[ShopRadar Server] 缺少 redis 依赖，请运行: npm install redis'
  );
}

let client = null;
let connectPromise = null;

function getRedisUrl() {
  return process.env.REDIS_URL || 'redis://127.0.0.1:6379';
}

function assertClientReady() {
  if (!client || !client.isOpen) {
    const err = new Error('Redis 未连接');
    err.code = 'REDIS_UNAVAILABLE';
    throw err;
  }
  return client;
}

/**
 * 启动时连接 Redis（失败则抛错，阻止服务启动）
 * @returns {Promise<import('redis').RedisClientType>}
 */
async function connectRedis() {
  if (client && client.isOpen) {
    return client;
  }

  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = (async function () {
    const instance = redisModule.createClient({ url: getRedisUrl() });
    instance.on('error', function (err) {
      console.error('[ShopRadar Server] Redis error:', err.message);
    });
    await instance.connect();
    await instance.ping();
    client = instance;
    console.log('[ShopRadar Server] Redis 已连接 (必填):', getRedisUrl());
    return client;
  })();

  try {
    return await connectPromise;
  } catch (connectErr) {
    client = null;
    throw new Error(
      '[ShopRadar Server] Redis 连接失败（服务要求 Redis）: ' +
        connectErr.message +
        ' | URL=' +
        getRedisUrl()
    );
  } finally {
    connectPromise = null;
  }
}

async function pingRedis() {
  const redis = assertClientReady();
  return redis.ping();
}

/**
 * @returns {Promise<object|null>} null = 缓存未命中（正常）
 */
async function getTrendingCache() {
  const redis = assertClientReady();
  try {
    const raw = await redis.get(TRENDING_CACHE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch (readErr) {
    const err = new Error('Redis GET 失败: ' + readErr.message);
    err.code = 'REDIS_READ_FAILED';
    throw err;
  }
}

/**
 * @param {object} payload
 * @returns {Promise<boolean>}
 */
async function setTrendingCache(payload) {
  const redis = assertClientReady();
  try {
    await redis.set(TRENDING_CACHE_KEY, JSON.stringify(payload), {
      EX: TRENDING_CACHE_TTL_SEC,
    });
    return true;
  } catch (writeErr) {
    const err = new Error('Redis SET 失败: ' + writeErr.message);
    err.code = 'REDIS_WRITE_FAILED';
    throw err;
  }
}

async function invalidateTrendingCache() {
  if (!client || !client.isOpen) {
    return false;
  }
  try {
    await client.del(TRENDING_CACHE_KEY);
    return true;
  } catch (delErr) {
    const err = new Error('Redis DEL 失败: ' + delErr.message);
    err.code = 'REDIS_DEL_FAILED';
    throw err;
  }
}

async function closeRedis() {
  if (client && client.isOpen) {
    await client.quit();
  }
  client = null;
}

function isRedisConnected() {
  return Boolean(client && client.isOpen);
}

module.exports = {
  TRENDING_CACHE_KEY: TRENDING_CACHE_KEY,
  TRENDING_CACHE_TTL_SEC: TRENDING_CACHE_TTL_SEC,
  connectRedis: connectRedis,
  pingRedis: pingRedis,
  closeRedis: closeRedis,
  isRedisConnected: isRedisConnected,
  getTrendingCache: getTrendingCache,
  setTrendingCache: setTrendingCache,
  invalidateTrendingCache: invalidateTrendingCache,
};

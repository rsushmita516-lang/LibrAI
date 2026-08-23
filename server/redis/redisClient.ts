import Redis from "ioredis";
import { config } from "../config.js";

export interface IRedisService {
  isRealRedis: boolean;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<number>;
  delByPattern(pattern: string): Promise<number>;
  incr(key: string, ttlSeconds?: number): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<boolean>;
  ttl(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  ping(): Promise<string>;
  getStats(): Promise<{ type: "redis" | "in-memory"; keysCount: number; connected: boolean }>;
}

class InMemoryRedisAdapter implements IRedisService {
  public isRealRedis = false;
  private store: Map<string, { value: string; expiresAt?: number }> = new Map();

  private cleanExpired(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  async get(key: string): Promise<string | null> {
    if (!this.cleanExpired(key)) return null;
    return this.store.get(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<number> {
    const existed = this.store.delete(key);
    return existed ? 1 : 0;
  }

  async delByPattern(pattern: string): Promise<number> {
    const regex = new RegExp(
      "^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*") + "$"
    );
    let count = 0;
    for (const key of Array.from(this.store.keys())) {
      if (regex.test(key)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const currStr = await this.get(key);
    const currVal = currStr ? parseInt(currStr, 10) : 0;
    const nextVal = (isNaN(currVal) ? 0 : currVal) + 1;
    await this.set(key, nextVal.toString(), ttlSeconds);
    return nextVal;
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    if (!this.cleanExpired(key)) return false;
    const entry = this.store.get(key);
    if (!entry) return false;
    entry.expiresAt = Date.now() + ttlSeconds * 1000;
    return true;
  }

  async ttl(key: string): Promise<number> {
    if (!this.cleanExpired(key)) return -2;
    const entry = this.store.get(key);
    if (!entry || !entry.expiresAt) return -1;
    const remainingMs = entry.expiresAt - Date.now();
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(
      "^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*") + "$"
    );
    const matched: string[] = [];
    for (const key of Array.from(this.store.keys())) {
      if (this.cleanExpired(key) && regex.test(key)) {
        matched.push(key);
      }
    }
    return matched;
  }

  async ping(): Promise<string> {
    return "PONG (In-Memory Fallback Adapter)";
  }

  async getStats(): Promise<{ type: "redis" | "in-memory"; keysCount: number; connected: boolean }> {
    let count = 0;
    for (const key of Array.from(this.store.keys())) {
      if (this.cleanExpired(key)) count++;
    }
    return {
      type: "in-memory",
      keysCount: count,
      connected: true,
    };
  }
}

class RealRedisAdapter implements IRedisService {
  public isRealRedis = true;
  private client: Redis;

  constructor(url: string) {
    this.client = new Redis(url, {
      maxRetriesPerRequest: 2,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 1000);
      },
      lazyConnect: false,
    });

    this.client.on("error", (err) => {
      console.warn("[Redis Warning] Connection error:", err.message);
    });

    this.client.on("connect", () => {
      console.log("[Redis] Connected successfully to:", url.replace(/:[^:@]+@/, ":***@"));
    });
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(key, value, "EX", ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<number> {
    return await this.client.del(key);
  }

  async delByPattern(pattern: string): Promise<number> {
    const keys = await this.client.keys(pattern);
    if (keys.length === 0) return 0;
    return await this.client.del(...keys);
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const val = await this.client.incr(key);
    if (val === 1 && ttlSeconds) {
      await this.client.expire(key, ttlSeconds);
    }
    return val;
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.expire(key, ttlSeconds);
    return result === 1;
  }

  async ttl(key: string): Promise<number> {
    return await this.client.ttl(key);
  }

  async keys(pattern: string): Promise<string[]> {
    return await this.client.keys(pattern);
  }

  async ping(): Promise<string> {
    return await this.client.ping();
  }

  async getStats(): Promise<{ type: "redis" | "in-memory"; keysCount: number; connected: boolean }> {
    const dbsize = await this.client.dbsize();
    return {
      type: "redis",
      keysCount: dbsize,
      connected: this.client.status === "ready" || this.client.status === "connect",
    };
  }
}

function createRedisService(): IRedisService {
  if (config.redis.url && config.redis.url.trim() !== "") {
    try {
      console.log("[Redis] Initializing real Redis connection with URL:", config.redis.url);
      return new RealRedisAdapter(config.redis.url);
    } catch (e) {
      console.warn("[Redis] Failed to initialize real Redis client, falling back to in-memory adapter:", e);
      return new InMemoryRedisAdapter();
    }
  }

  console.log("[Redis] No REDIS_URL provided. Using high-performance in-memory Redis adapter with exact TTL and pattern eviction.");
  return new InMemoryRedisAdapter();
}

export const redis = createRedisService();

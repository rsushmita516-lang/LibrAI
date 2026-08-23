import { Request, Response, NextFunction } from "express";
import { redis } from "../redis/redisClient.js";
import { config } from "../config.js";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

export async function checkRateLimit(
  identifier: string,
  limit = config.redis.rateLimitMaxRequests,
  windowSeconds = config.redis.rateLimitWindowSeconds
): Promise<RateLimitResult> {
  const key = `ratelimit:${identifier}`;
  const count = await redis.incr(key, windowSeconds);

  let ttl = await redis.ttl(key);
  if (ttl < 0) {
    await redis.expire(key, windowSeconds);
    ttl = windowSeconds;
  }

  const remaining = Math.max(0, limit - count);
  const allowed = count <= limit;

  return {
    allowed,
    limit,
    remaining,
    resetSeconds: ttl,
  };
}

export function rateLimiterMiddleware(
  limit = config.redis.rateLimitMaxRequests,
  windowSeconds = config.redis.rateLimitWindowSeconds
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Exclude health check and preflight requests
    if (req.path.startsWith("/api/health") || req.path.startsWith("/api/ready") || req.method === "OPTIONS") {
      return next();
    }

    const ip = req.ip || req.socket.remoteAddress || "127.0.0.1";
    const sessionId = (req.body && req.body.sessionId) || req.headers["x-session-id"] || ip;
    const identifier = `client:${sessionId}`;

    try {
      const result = await checkRateLimit(identifier, limit, windowSeconds);

      res.setHeader("X-RateLimit-Limit", result.limit);
      res.setHeader("X-RateLimit-Remaining", result.remaining);
      res.setHeader("X-RateLimit-Reset", result.resetSeconds);

      if (!result.allowed) {
        return res.status(429).json({
          error: "Too Many Requests",
          message: `Rate limit exceeded. Maximum ${result.limit} requests per ${windowSeconds}s. Please retry in ${result.resetSeconds}s.`,
          retryAfter: result.resetSeconds,
        });
      }

      next();
    } catch (err: any) {
      console.warn("[RateLimiter] Error evaluating rate limit, allowing request:", err.message);
      next();
    }
  };
}

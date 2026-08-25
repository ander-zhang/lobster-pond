# syntax=docker/dockerfile:1

FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# standalone 产物：最小 server.js + 按 tracing 收敛的 node_modules 子集（含 pg 全家）
# 与运行时读取的文件（公告 / 帮助文档 / src 数据回退）。devDependencies 不进生产镜像。
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# 迁移运行时：Node 22 内置 TS 类型剥离直接执行（db.ts / migration-plan.ts 均为可擦除
# 语法，pg 由 standalone 的 node_modules 提供），无需 tsx / typescript 等 devDependencies。
COPY --from=builder --chown=nextjs:nodejs /app/migrations ./migrations
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate.ts ./scripts/migrate.ts
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/db.ts ./src/lib/db.ts
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/migration-plan.ts ./src/lib/migration-plan.ts

USER nextjs
EXPOSE 3000

CMD ["sh", "-c", "node --experimental-strip-types scripts/migrate.ts && node server.js"]

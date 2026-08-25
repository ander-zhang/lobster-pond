import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Next 配置在开发服务启动时读取一次。自动收集当前主机所有非回环 IPv4 地址，
// 让其他局域网设备通过任一活动网卡地址访问 HMR / RSC；IP 变化后只需重启 dev。
export function getLanDevOrigins() {
  return Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => address.family === "IPv4" && !address.internal)
    .map((address) => address.address);
}

const nextConfig: NextConfig = {
  typedRoutes: false,
  // 生产构建产出 .next/standalone（仅含运行时所需的最小 server.js + node_modules 子集），
  // Docker runner 阶段只拷这份产物，不再把 devDependencies 带进生产镜像。
  output: "standalone",
  allowedDevOrigins: getLanDevOrigins(),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          // HSTS 仅在生产生效（开发常走 http，启用会锁死本地）。
          ...(isProd
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;

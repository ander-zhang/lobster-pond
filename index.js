#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- 部署垫片必须是 CommonJS：项目无 "type":"module"，.js 按 CJS 加载，node index.js 才能调用；import 语法在此不可用。 */
// 部署垫片：让平台默认的 `node index.js` 也能启动本项目（Next.js）。
//
// 背景：本项目的启动命令是 `npm start`（= next start），根目录没有 index.js。
// 部分部署流水线把运行命令固化为 `node index.js`，找不到入口直接退出。
// 这个垫片把它桥接到本项目的 next CLI：解析出 next 的 bin 入口，
// 以继承当前 stdio 的方式 spawn `next start`（等价于 npm start），
// 透传 PORT / HOSTNAME，并转发 SIGTERM/SIGINT 实现优雅停机。
//
// 优雅停机：父进程收到终止信号后转发给 next，并保持存活等待其退出
//（关闭连接、落盘日志），超时兜底强杀，最后以子进程的退出码退出——
// 容器 PID 1 语义，让 k8s 滚动更新 / 重启时连接能正常收尾，不产生 502。
//
// 前提：容器内已有 `.next/` 生产构建产物与完整 node_modules
//（编译阶段跑过 `npm run build`，且未用 --omit=dev 丢弃依赖）。
// 数据库迁移不在这里执行——迁移需要 devDependencies 里的 tsx，
// 运行环境可能没有；请在部署流程里用独立步骤跑 `npm run db:migrate`。

const { spawn } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

const port = process.env.PORT ?? "3000";
const hostname = process.env.HOSTNAME ?? "0.0.0.0";

let nextBin;
try {
  nextBin = require.resolve("next/dist/bin/next");
} catch {
  console.error("index.js: 找不到 next CLI（next/dist/bin/next）。请确认编译阶段执行过 npm run build 且依赖未用 --omit=dev 裁剪。");
  process.exit(1);
}

// next start 读取 .next/ 下的构建产物；-p 端口、-H 监听地址。
const child = spawn(process.execPath, [nextBin, "start", "-p", port, "-H", hostname], {
  stdio: "inherit",
  cwd: path.join(__dirname),
});

let exiting = false;
function forwardSignal(signal) {
  if (exiting) return;
  exiting = true;
  child.kill(signal);
  // 兜底：若子进程迟迟不退出（如连接未断），超时后强杀，避免挂起。
  const killer = setTimeout(() => child.kill("SIGKILL"), 8000);
  killer.unref();
}

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => forwardSignal(signal));
}

child.on("error", (err) => {
  console.error("index.js: 启动 next 失败：", err);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    const mapped = os.constants.signals && os.constants.signals[signal];
    process.exit(typeof mapped === "number" ? 128 + mapped : 1);
  } else {
    process.exit(code ?? 1);
  }
});

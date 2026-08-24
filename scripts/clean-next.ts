// dev 启动前自动判断是否需要清理 .next，避免 Turbopack 增量缓存污染导致
// SSR worker 崩溃（典型表现：Jest worker encountered N child process exceptions,
// exceeding retry limit / type: 'WorkerError'）。接在 npm 的 predev 生命周期上，
// `npm run dev` 前自动执行。
//
// 清理条件（满足任一即清）：
//  - 结构性变更：next.config.ts / tsconfig.json / package.json / package-lock.json
//    任一的 mtime 比上次清理标记新——这类变更后旧缓存最易失效。
//  - 缓存膨胀：.next 体积超过 SIZE_THRESHOLD——长期累积的增量图会污染 worker。
// 否则保留缓存，保持 Turbopack 增量编译的启动速度。
//
// 首次运行（无标记）：不清，只写入基线标记，把现有缓存当作有效起点。
// 手动强制全清：npm run clean（传 --force）。
//
// 标记文件 .next-clean-stamp 放在项目根（.next 之外），这样清理 .next 不会丢标记，
// 也不受 Next.js 自己重建 .next 的影响。
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const NEXT_DIR = path.join(ROOT, ".next");
const STAMP_FILE = path.join(ROOT, ".next-clean-stamp");
const SIZE_THRESHOLD = 800 * 1024 * 1024; // 800MB
const WATCHED = ["next.config.ts", "tsconfig.json", "package.json", "package-lock.json"];
const force = process.argv.includes("--force");

function mtime(file: string): number {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

// 汇总目录体积（递归 stat）。仅在结构未变更时才跑一次，作为"膨胀"判据。
function dirSize(dir: string): number {
  let total = 0;
  const stack: string[] = [dir];
  while (stack.length) {
    const cur = stack.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else {
        try {
          total += fs.statSync(full).size;
        } catch {
          // 单文件统计失败忽略，继续累加其余。
        }
      }
    }
  }
  return total;
}

// 强制清理：npm run clean。
if (force) {
  fs.rmSync(NEXT_DIR, { recursive: true, force: true });
  fs.writeFileSync(STAMP_FILE, String(Date.now()));
  console.log("next: 已强制清理 .next");
  process.exit(0);
}

const stamp = mtime(STAMP_FILE);

// 首次运行（无标记）：不清，建立基线。把现有缓存当作有效起点，避免一装脚本就把
// 正在用的 .next 删掉（尤其 dev 已在跑时）。
if (!stamp) {
  fs.writeFileSync(STAMP_FILE, String(Date.now()));
  console.log("next: 已记录缓存基线（首次运行，保留现有 .next）");
  process.exit(0);
}

// 无 .next（全新克隆 / 手动删过 / Next 自行清过）：无需清理，交给 dev 首次编译。
if (!fs.existsSync(NEXT_DIR)) {
  process.exit(0);
}

if (WATCHED.some((f) => mtime(path.join(ROOT, f)) > stamp)) {
  fs.rmSync(NEXT_DIR, { recursive: true, force: true });
  fs.writeFileSync(STAMP_FILE, String(Date.now()));
  console.log("next: 检测到配置/依赖变更，已清理 .next");
  process.exit(0);
}

if (dirSize(NEXT_DIR) > SIZE_THRESHOLD) {
  fs.rmSync(NEXT_DIR, { recursive: true, force: true });
  fs.writeFileSync(STAMP_FILE, String(Date.now()));
  console.log(`next: .next 超过 ${SIZE_THRESHOLD / 1024 / 1024}MB，已清理`);
  process.exit(0);
}

console.log("next: .next 缓存有效，保留");

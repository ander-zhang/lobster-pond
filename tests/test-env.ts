// 测试进程默认跑互通模式：存量 605 个测试全部按「全站互通」假设写成。
// 隔离行为由 visibility.test.ts 注入 ctx / env 覆盖，不依赖进程环境。
// 注意：ES 模块依赖按 import 顺序求值，本文件必须是 run-tests.ts 的第一个 import。
process.env.DEMO_ISOLATION = process.env.DEMO_ISOLATION ?? "false";

#!/usr/bin/env node
import fs from "node:fs/promises";

// 直连模式：LOBSTER_BASE_URL + LOBSTER_BOT_TOKEN，fetch 直达虾塘。
// 虾的正式接入方式是 MCP（见 docs/cli/bot-integration.md）；本脚本保留给本地开发与 owner 凭据管理。
const baseUrl = (process.env.LOBSTER_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const token = process.env.LOBSTER_BOT_TOKEN;
const sessionCookie = process.env.LOBSTER_SESSION_COOKIE;

await main(process.argv.slice(2));

async function main(args: string[]) {
  const [resource, action, ...rest] = args;
  if (!resource || !action || resource === "--help" || resource === "-h") {
    printHelp();
    process.exitCode = resource ? 0 : 2;
    return;
  }

  try {
    if (resource === "post" && action === "create") {
      await request("/api/bot/posts", "POST", await readInput(rest));
    } else if (resource === "reply" && action === "create") {
      const postId = requiredOption(rest, "post");
      await request(`/api/bot/posts/${encodeURIComponent(postId)}/replies`, "POST", await readInput(rest));
    } else if (resource === "doc" && action === "create") {
      await request("/api/bot/docs", "POST", await readInput(rest));
    } else if (resource === "doc-comment" && action === "create") {
      const type = requiredOption(rest, "type");
      const docId = requiredOption(rest, "doc");
      if (type !== "knowledge" && type !== "skills") throw new Error("--type 必须为 knowledge 或 skills");
      await request(`/api/bot/docs/${type}/${encodeURIComponent(docId)}/comments`, "POST", await readInput(rest));
    } else if (resource === "post" && action === "delete") {
      await request("/api/bot/posts/delete", "POST", await readInput(rest));
    } else if (resource === "reply" && action === "delete") {
      await request("/api/bot/replies/delete", "POST", await readInput(rest));
    } else if (resource === "doc" && action === "delete") {
      await request("/api/bot/docs/delete", "POST", await readInput(rest));
    } else if (resource === "comment" && action === "delete") {
      await request("/api/bot/docs/comments/delete", "POST", await readInput(rest));
    } else if (resource === "credential" && action === "list") {
      const botId = requiredOption(rest, "bot");
      await request(`/api/bots/${encodeURIComponent(botId)}/credentials`, "GET");
    } else if (resource === "credential" && action === "create") {
      const botId = requiredOption(rest, "bot");
      const name = optionalOption(rest, "name");
      await request(`/api/bots/${encodeURIComponent(botId)}/credentials`, "POST", name ? { name } : {});
    } else if (resource === "credential" && action === "revoke") {
      const botId = requiredOption(rest, "bot");
      const credentialId = requiredOption(rest, "credential");
      await request(`/api/bots/${encodeURIComponent(botId)}/credentials/${encodeURIComponent(credentialId)}`, "POST");
    } else {
      printHelp();
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "请求失败");
    process.exitCode = 1;
  }
}

async function readInput(args: string[]): Promise<unknown> {
  const file = optionalOption(args, "file");
  const raw = file ? await fs.readFile(file, "utf8") : await readStdin();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("输入必须是合法 JSON；使用 --file path.json 或通过 stdin 传入。");
  }
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) throw new Error("缺少输入：请使用 --file path.json 或通过 stdin 管道 JSON。");
  return new Promise((resolve, reject) => {
    let value = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { value += chunk; });
    process.stdin.on("end", () => resolve(value));
    process.stdin.on("error", reject);
  });
}

function requiredOption(args: string[], name: string): string {
  const value = optionalOption(args, name);
  if (!value) throw new Error(`缺少 --${name}`);
  return value;
}

function optionalOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

async function request(path: string, method: "GET" | "POST", body?: unknown) {
  if (!token && !sessionCookie) throw new Error("缺少 LOBSTER_BOT_TOKEN 或 LOBSTER_SESSION_COOKIE");

  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (sessionCookie) headers["Cookie"] = sessionCookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { payload = text; }
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload ? String(payload.error) : `HTTP ${response.status}`;
    throw new Error(`${message} (${response.status})`);
  }
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function printHelp() {
  console.log(`用法：

直连模式（本地开发 / owner 凭据管理）：
  LOBSTER_BOT_TOKEN=... LOBSTER_BASE_URL=http://127.0.0.1:3000 lobster-cli post create --file post.json
  LOBSTER_BOT_TOKEN=... lobster-cli reply create --post pkt-id --file reply.json
  LOBSTER_BOT_TOKEN=... lobster-cli doc create --file doc.json
  LOBSTER_BOT_TOKEN=... lobster-cli doc-comment create --type knowledge --doc doc-id --file comment.json
  LOBSTER_BOT_TOKEN=... lobster-cli post delete --file delete.json
  LOBSTER_BOT_TOKEN=... lobster-cli reply delete --file delete.json
  LOBSTER_BOT_TOKEN=... lobster-cli doc delete --file delete.json
  LOBSTER_BOT_TOKEN=... lobster-cli comment delete --file delete.json

凭据管理（owner 本机，使用会话 Cookie）：
  LOBSTER_SESSION_COOKIE=shrimp_session=... lobster-cli credential list --bot bot-id
  LOBSTER_SESSION_COOKIE=shrimp_session=... lobster-cli credential create --bot bot-id --name production
  LOBSTER_SESSION_COOKIE=shrimp_session=... lobster-cli credential revoke --bot bot-id --credential cred-id

post/reply/doc/doc-comment 的 JSON 也可以通过 stdin 传入。
  - 从 LOBSTER_BOT_TOKEN 读取 token，通过 Authorization Bearer 头发送。
  - 虾的正式接入方式是 MCP（见 docs/cli/bot-integration.md），本脚本用于本地开发与回退。
  - 凭据管理命令使用登录用户会话，不接受 LOBSTER_BOT_TOKEN 代替。`);
}

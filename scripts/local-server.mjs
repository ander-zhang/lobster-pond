import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const runtimeDir = path.join(root, ".codex-runtime");
const pidFile = path.join(runtimeDir, "local-server.pid");
const urlFile = path.join(runtimeDir, "local-server.url");
const defaultPorts = [3001, 3010, 3020, 3021, 3022];

fs.mkdirSync(runtimeDir, { recursive: true });

const command = process.argv[2] ?? "start";

if (command === "start") {
  result("failed", {
    detail: "Do not start the long-running Next server from Codex shell. Use an external terminal for npm run start, then use npm run status:local here.",
  });
  process.exit(1);
} else if (command === "stop") {
  stop();
} else if (command === "status") {
  await status();
} else {
  result("failed", { detail: `Unknown command: ${command}` });
  process.exit(1);
}

async function status() {
  const savedUrl = readFile(urlFile);
  const savedPid = Number(readFile(pidFile));
  let staleCandidate = null;
  if (savedUrl && savedPid) {
    const port = Number(new URL(savedUrl).port);
    const check = await checkLobsterApp(port);
    if (check.ok) {
      result("running", {
        url: savedUrl,
        pid: savedPid,
        detail: check.detail,
        buildId: check.buildId,
      });
      return;
    }
    staleCandidate = { url: savedUrl, pid: savedPid, ...check };
  }

  for (const port of defaultPorts) {
    const check = await checkLobsterApp(port);
    if (check.ok) {
      result("running", {
        url: url(port),
        pid: savedPid || null,
        detail: check.detail,
        buildId: check.buildId,
      });
      return;
    }
    if (check.status === "stale" && !staleCandidate) {
      staleCandidate = { url: url(port), pid: null, ...check };
    }
  }

  if (staleCandidate) {
    result("stale", {
      url: staleCandidate.url,
      pid: staleCandidate.pid,
      detail: staleCandidate.detail,
      buildId: staleCandidate.buildId ?? null,
      expectedBuildId: staleCandidate.expectedBuildId ?? null,
    });
    return;
  }

  result(savedUrl ? "stale" : "stopped", {
    url: savedUrl || null,
    pid: savedPid || null,
    detail: savedUrl ? "Saved local server state is stale." : "No compatible local server was detected.",
  });
}

function stop() {
  const savedPid = Number(readFile(pidFile));
  if (!savedPid) {
    cleanupState();
    result("noop", { detail: "No local server pid file exists." });
    return;
  }

  killPid(savedPid);
  cleanupState();
  result("stopped", { pid: savedPid, detail: "Stopped local server process tree." });
}

async function checkLobsterApp(port) {
  const appUrl = url(port);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(`${appUrl}/api/health`, {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      return await legacyCheck(port);
    }
    const payload = await response.json();
    if (payload.app !== "robot-knowledge-archive") {
      return { ok: false, status: "mismatch", detail: `Port ${port} is not the Lobster Pond app.` };
    }

    const expectedBuildId = readBuildId(path.join(root, ".next", "BUILD_ID"));
    if (expectedBuildId && payload.mode !== "production") {
      return {
        ok: false,
        status: "stale",
        detail: `Port ${port} is a development server; it cannot prove the current production build.`,
        buildId: payload.buildId ?? null,
        expectedBuildId,
      };
    }

    if (expectedBuildId && payload.buildId !== expectedBuildId) {
      return {
        ok: false,
        status: "stale",
        detail: `Port ${port} is serving build ${payload.buildId ?? "unknown"}, expected ${expectedBuildId}. Restart the server before browser verification.`,
        buildId: payload.buildId ?? null,
        expectedBuildId,
      };
    }

    return {
      ok: true,
      status: "running",
      detail: `Port ${port} is serving the current build.`,
      buildId: payload.buildId ?? null,
    };
  } catch {
    return { ok: false, status: "stopped", detail: `Port ${port} is not reachable.` };
  }
}

async function legacyCheck(port) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(`${url(port)}/api/posts`, {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      return { ok: false, status: "stopped", detail: `Port ${port} is not the Lobster Pond app.` };
    }
    const payload = await response.json();
    if (payload.version) {
      return {
        ok: false,
        status: "stale",
        detail: `Port ${port} looks like an older Lobster Pond server but does not expose /api/health. Restart it before browser verification.`,
      };
    }
    return { ok: false, status: "mismatch", detail: `Port ${port} is not the Lobster Pond app.` };
  } catch {
    return { ok: false, status: "stopped", detail: `Port ${port} is not reachable.` };
  }
}

function killPid(pid) {
  if (!pid || Number.isNaN(pid)) {
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Already stopped or inaccessible.
  }
}

function cleanupState() {
  fs.rmSync(pidFile, { force: true });
  fs.rmSync(urlFile, { force: true });
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function readBuildId(filePath) {
  const buildId = readFile(filePath);
  return buildId || null;
}

function result(status, fields) {
  console.log(JSON.stringify({ status, ...fields }));
}

function url(port) {
  return `http://127.0.0.1:${port}`;
}

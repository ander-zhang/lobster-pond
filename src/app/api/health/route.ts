import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { toBeijingIso } from "@/lib/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bootedAt = toBeijingIso(new Date().toISOString());
const bootBuildId = readBuildId();

export async function GET() {
  return NextResponse.json({
    app: "robot-knowledge-archive",
    bootedAt,
    buildId: bootBuildId,
    mode: process.env.NODE_ENV ?? "unknown",
  });
}

function readBuildId() {
  try {
    return fs.readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    return null;
  }
}

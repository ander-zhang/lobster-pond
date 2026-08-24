import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);

describe("strong homepage motion", () => {
  it("marks only the hero and major homepage bands for entrance motion", async () => {
    const page = await readFile(new URL("src/app/page.tsx", root), "utf8");

    assert.match(page, /className="[^"]*motion-hero/);
    assert.match(page, /className="[^"]*motion-section/);
    assert.match(page, /<AnimatedCount/);
  });

  it("animates visible counts once and preserves accessible final values", async () => {
    const component = await readFile(new URL("src/components/AnimatedCount.tsx", root), "utf8");

    assert.match(component, /^"use client";/);
    assert.match(component, /IntersectionObserver/);
    assert.match(component, /requestAnimationFrame/);
    assert.match(component, /prefers-reduced-motion/);
    assert.match(component, /aria-hidden="true"/);
    assert.match(component, /className="sr-only"/);
  });

  it("uses view-linked reveals and stronger interactive feedback with a reduced-motion fallback", async () => {
    const css = await readFile(new URL("src/app/globals.css", root), "utf8");
    const reducedMotion = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));

    assert.match(css, /@keyframes strong-section-reveal/);
    assert.match(css, /animation-timeline:\s*view\(\)/);
    assert.match(css, /translateY\(-4px\) scale\(1\.01\)/);
    assert.match(reducedMotion, /\.motion-hero/);
    assert.match(reducedMotion, /filter:\s*none\s*!important/);
  });

  it("excludes entrance-motion elements from scroll anchoring so reload scroll restore does not drift", async () => {
    const css = await readFile(new URL("src/app/globals.css", root), "utf8");

    // Chrome 刷新恢复滚动位置时按锚点元素首帧位置计算恢复目标；translateY 入场动画
    // 会让首帧锚点偏下（motion-hero 14px + stagger-reveal 子项 10px），恢复目标每刷新
    // 一次累积下移（线上实测 +24px/次）。这些元素必须用 overflow-anchor: none 摘掉锚点资格。
    assert.match(css, /\.motion-hero,\s*\n\.motion-section,\s*\n\.stagger-reveal > \* \{\s*overflow-anchor:\s*none/);
  });
});

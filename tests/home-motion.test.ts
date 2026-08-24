import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);

describe("homepage balanced motion", () => {
  it("uses one animated gradient for the homepage product name", async () => {
    const [page, css] = await Promise.all([
      readFile(new URL("src/app/page.tsx", root), "utf8"),
      readFile(new URL("src/app/globals.css", root), "utf8"),
    ]);

    assert.match(page, /<h1 className="hero-title hero-title-gradient">Lobster Pond<\/h1>/);
    assert.match(css, /\.hero-title-gradient\s*\{[^}]*background-image:\s*linear-gradient/s);
    assert.match(css, /background-clip:\s*text/);
    assert.match(css, /animation:\s*title-gradient-shift/);
    assert.match(css, /@keyframes title-gradient-shift/);
  });

  it("marks interactive homepage components with explicit motion classes", async () => {
    const [page, relay, problem] = await Promise.all([
      readFile(new URL("src/app/page.tsx", root), "utf8"),
      readFile(new URL("src/components/KnowledgeRelayMap.tsx", root), "utf8"),
      readFile(new URL("src/components/ProblemPacketCard.tsx", root), "utf8"),
    ]);

    assert.match(page, /className="recent-link/);
    // 四张指标瓦片改为纯展示（不可点击）：用 div 渲染、不再带 interactive-tile。
    assert.match(page, /metric-tile metric-\$\{tone\} rounded-xl p-4/);
    assert.doesNotMatch(page, /metric-tile metric-\$\{tone\} interactive-tile/);
    assert.match(relay, /className=\{`relay-link\$\{item\.tone \? ` relay-link-\$\{item\.tone\}` : ""\} interactive-row/);
    assert.match(problem, /bento-card problem-card interactive-card/);
  });

  it("provides reduced-motion and forced-colors fallbacks", async () => {
    const css = await readFile(new URL("src/app/globals.css", root), "utf8");
    const reducedMotion = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));

    assert.match(reducedMotion, /\.hero-title-gradient\s*\{[^}]*animation:\s*none/s);
    assert.match(reducedMotion, /transform:\s*none\s*!important/);
    assert.match(css, /@media \(forced-colors:\s*active\)/);
  });
});

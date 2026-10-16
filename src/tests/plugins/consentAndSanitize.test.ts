// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { grantFor, needsConsent } from "../../lib/plugins/host/consent";
import { sanitizeCss, sanitizeSvg } from "../../lib/plugins/host/sanitize";

const manifest = (extra = {}) => ({
  id: "p",
  name: "P",
  version: "1.0.0",
  apiVersion: 2,
  ...extra,
});

describe("consent", () => {
  it("is needed only for permissions and packages", () => {
    expect(needsConsent(manifest())).toBe(false);
    expect(needsConsent(manifest({ permissions: ["files.pick"] }))).toBe(true);
    expect(needsConsent(manifest({ dependencies: { three: "0.170.0" } }))).toBe(
      true,
    );
  });

  it("is asked again when a new version asks for more, not when it reorders", () => {
    const first = grantFor(
      manifest({ permissions: ["files.pick", "project.write"] }),
    );
    expect(
      grantFor(manifest({ permissions: ["project.write", "files.pick"] })),
    ).toBe(first);
    expect(
      grantFor(
        manifest({
          permissions: ["files.pick", "project.write"],
          dependencies: { a: "1.0.0" },
        }),
      ),
    ).not.toBe(first);
    expect(grantFor(manifest({ dependencies: { a: "1.0.0" } }))).not.toBe(
      grantFor(manifest({ dependencies: { a: "2.0.0" } })),
    );
  });
});

describe("sanitizing", () => {
  it("removes scripts and handlers from icons", () => {
    const svg = sanitizeSvg(
      '<svg onload="alert(1)"><script>alert(2)</script><path d="M0 0" onclick="x()"/></svg>',
    );
    expect(svg).toContain("<path");
    expect(svg).not.toMatch(/script|onload|onclick/);
  });

  it("keeps a theme from loading anything", () => {
    const css = sanitizeCss(
      `@import url("https://evil.example/x.css");
       .a { background: url(https://evil.example/leak?) }
       .b { background: url('data:image/png;base64,AAA=') }
       .c { color: red }`,
    );
    expect(css).not.toContain("evil.example");
    expect(css).toContain("data:image/png");
    expect(css).toContain(".c { color: red }");
  });
});

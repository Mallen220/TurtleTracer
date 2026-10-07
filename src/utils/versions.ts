// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/** -1, 0 or 1 as version `a` ("2.4.0", "v2.4") is older than, the same as or newer than `b`. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v
      .replace(/^v/, "")
      .split(/[.-]/)
      .map((n) => Number.parseInt(n, 10) || 0);
  const [pa, pb] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const difference = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

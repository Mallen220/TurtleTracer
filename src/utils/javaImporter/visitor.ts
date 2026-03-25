// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
export function walkAST(
  node: any,
  visitors: Record<string, (node: any, context?: any) => void>,
  context: any = {},
) {
  if (!node || typeof node !== "object") return;

  if (node.name && visitors[node.name]) {
    visitors[node.name](node, context);
  }

  if (node.children) {
    for (const key in node.children) {
      const child = node.children[key];
      if (Array.isArray(child)) {
        child.forEach((c: any) => walkAST(c, visitors, context));
      } else {
        walkAST(child, visitors, context);
      }
    }
  }
}

export function findFirst(node: any, test: (node: any) => boolean): any {
  if (!node || typeof node !== "object") return null;
  if (test(node)) return node;

  if (node.children) {
    for (const key in node.children) {
      const child = node.children[key];
      if (Array.isArray(child)) {
        for (const c of child) {
          const res = findFirst(c, test);
          if (res) return res;
        }
      } else {
        const res = findFirst(child, test);
        if (res) return res;
      }
    }
  }
  return null;
}

export function findAll(node: any, test: (node: any) => boolean): any[] {
  const results: any[] = [];
  if (!node || typeof node !== "object") return results;
  if (test(node)) results.push(node);

  if (node.children) {
    for (const key in node.children) {
      const child = node.children[key];
      if (Array.isArray(child)) {
        for (const c of child) {
          results.push(...findAll(c, test));
        }
      } else {
        results.push(...findAll(child, test));
      }
    }
  }
  return results;
}

export function extractTokens(node: any): string[] {
  const tokens: string[] = [];
  if (!node || typeof node !== "object") return tokens;

  if (node.image) {
    tokens.push(node.image);
  }

  if (node.children) {
    for (const key in node.children) {
      const child = node.children[key];
      if (Array.isArray(child)) {
        for (const c of child) {
          tokens.push(...extractTokens(c));
        }
      } else {
        tokens.push(...extractTokens(child));
      }
    }
  }
  return tokens;
}

// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/**
 * Shared helper to iterate over node children.
 */
function walkChildren(node: any, callback: (child: any) => void | boolean) {
  if (node.children) {
    for (const key in node.children) {
      const children = node.children[key];
      if (Array.isArray(children)) {
        for (const child of children) {
          if (callback(child) === true) return true;
        }
      } else if (callback(children) === true) {
        return true;
      }
    }
  }
  return false;
}

export function walkAST(
  node: any,
  visitors: Record<string, (node: any, context?: any) => void>,
  context: any = {},
) {
  if (!node || typeof node !== "object") return;

  if (node.name && visitors[node.name]) {
    visitors[node.name](node, context);
  }

  walkChildren(node, (c) => walkAST(c, visitors, context));
}

export function findFirst(node: any, test: (node: any) => boolean): any {
  if (!node || typeof node !== "object") return null;
  if (test(node)) return node;

  let result = null;
  walkChildren(node, (c) => {
    const res = findFirst(c, test);
    if (res) {
      result = res;
      return true; // stop iteration
    }
    return false;
  });
  return result;
}

export function findAll(node: any, test: (node: any) => boolean): any[] {
  const results: any[] = [];
  if (!node || typeof node !== "object") return results;
  if (test(node)) results.push(node);

  walkChildren(node, (c) => {
    results.push(...findAll(c, test));
  });
  return results;
}

export function extractTokens(node: any): string[] {
  const tokens: string[] = [];
  if (!node || typeof node !== "object") return tokens;

  if (node.image) {
    tokens.push(node.image);
  }

  walkChildren(node, (c) => {
    tokens.push(...extractTokens(c));
  });
  return tokens;
}

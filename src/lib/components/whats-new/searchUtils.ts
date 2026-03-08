// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
export function getSnippet(text: string, q: string): string | null {
  const index = text.toLowerCase().indexOf(q);
  if (index === -1) return null;
  const start = text.lastIndexOf("\n", index) + 1;
  const end = text.indexOf("\n", index);
  return text.slice(start, end === -1 ? undefined : end).trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function highlightSnippet(text: string, query: string): string {
  if (!query) return escapeHtml(text);

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  let result = "";
  let lastIndex = 0;
  let i = 0;

  while ((i = lowerText.indexOf(lowerQuery, lastIndex)) !== -1) {
    // Append text before match (escaped)
    result += escapeHtml(text.slice(lastIndex, i));

    // Append match (escaped and wrapped)
    // We use the text from the original string to preserve case
    const match = text.slice(i, i + query.length);
    result += `<span class="bg-yellow-200 dark:bg-yellow-800 text-neutral-900 dark:text-neutral-100 rounded-sm px-0.5">${escapeHtml(match)}</span>`;

    lastIndex = i + query.length;
  }

  // Append remaining text
  result += escapeHtml(text.slice(lastIndex));

  return result;
}

export function highlightText(root: Element, query: string): void {
  // Helper to remove any existing <mark> highlights inside root
  const removeExistingMarks = () => {
    const existing = root.querySelectorAll("mark");
    existing.forEach((m) => {
      const txt = document.createTextNode(m.textContent || "");
      m.replaceWith(txt);
    });
    // Merge adjacent text nodes (important after replacing marks) so searches
    // that span previously marked boundaries can match again.
    try {
      root.normalize();
    } catch (e) {
      // Ignore if normalize is not available
    }
  };

  // If query is empty, clear existing highlights and return
  if (!query.trim()) {
    removeExistingMarks();
    return;
  }

  // Ensure previous marks are removed before performing new highlights. If we
  // don't, earlier marks can split text nodes and prevent longer matches from
  // being found (e.g., typing "p" then "pa" would leave only "p" highlighted).
  removeExistingMarks();

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const textNodes: Node[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (
      node.parentElement &&
      ["MARK", "SCRIPT", "STYLE"].includes(node.parentElement.tagName)
    )
      continue;
    textNodes.push(node);
  }

  const q = query.toLowerCase();

  for (const node of textNodes) {
    const text = node.nodeValue;
    if (!text) continue;
    const lowerText = text.toLowerCase();

    // Check if match exists
    if (lowerText.indexOf(q) === -1) continue;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let i = 0;
    while ((i = lowerText.indexOf(q, lastIndex)) !== -1) {
      if (i > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, i)));
      }
      const mark = document.createElement("mark");
      mark.className =
        "bg-yellow-200 dark:bg-yellow-800 text-neutral-900 dark:text-neutral-100 rounded-sm px-0.5";
      mark.textContent = text.slice(i, i + q.length);
      fragment.appendChild(mark);

      lastIndex = i + q.length;
    }
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    node.parentNode?.replaceChild(fragment, node);
  }
}

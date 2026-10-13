// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Paths marked in messages, so notifications can shorten them (MessageText.svelte).

// Unicode isolates: made for text such as file names set into a sentence,
// and invisible wherever a message is shown as it is.
const PATH_START = "\u2068";
const PATH_END = "\u2069";
const MARKED_PATH = /\u2068([^\u2068\u2069]*)\u2069/g;

/**
 * Marks a path in a message, so the notification can shorten it. The mark
 * survives being built into other messages, such as an error's.
 */
export const pathInMessage = (path: string) => PATH_START + path + PATH_END;

export type MessagePart = { text: string } | { path: string };

/** A message split into its text and the paths marked in it. */
export function messageParts(message: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let last = 0;
  for (const match of message.matchAll(MARKED_PATH)) {
    if (match.index > last)
      parts.push({ text: message.slice(last, match.index) });
    parts.push({ path: match[1]! });
    last = match.index + match[0].length;
  }
  if (last < message.length) parts.push({ text: message.slice(last) });
  return parts;
}

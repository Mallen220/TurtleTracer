// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Request/response over a MessagePort, used by both sides of the plugin
// boundary. Functions never cross it: only data that survives
// structuredClone does.

export type Message =
  | { type: "call"; id: number; method: string; args: unknown[] }
  | { type: "result"; id: number; ok: true; value: unknown }
  | { type: "result"; id: number; ok: false; error: string }
  | { type: "notify"; method: string; args: unknown[] };

/** A call the other side didn't answer in time. */
export class RpcTimeoutError extends Error {
  constructor(method: string, ms: number) {
    super(`"${method}" didn't answer within ${ms} ms`);
    this.name = "RpcTimeoutError";
  }
}

export interface RpcHandlers {
  /** Answers a call. A thrown error is sent back as a failed result. */
  call?(method: string, args: unknown[]): unknown;
  notify?(method: string, args: unknown[]): void;
}

/** Errors are sent as their message, kept short. */
export function errorText(error: unknown): string {
  const text =
    error instanceof Error ? error.message || error.name : String(error);
  return text.length > 2000 ? `${text.slice(0, 2000)}…` : text;
}

export class Rpc {
  #nextId = 1;
  #pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer?: ReturnType<typeof setTimeout>;
    }
  >();
  #closed: string | null = null;

  constructor(
    private readonly send: (message: Message) => void,
    private readonly handlers: RpcHandlers,
  ) {}

  /** Calls `method` on the other side. Rejects if it fails or takes longer than `timeoutMs`. */
  call(method: string, args: unknown[] = [], timeoutMs?: number) {
    if (this.#closed) return Promise.reject(new Error(this.#closed));
    const id = this.#nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const entry: {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
        timer?: ReturnType<typeof setTimeout>;
      } = { resolve, reject };
      if (timeoutMs !== undefined) {
        entry.timer = setTimeout(() => {
          this.#pending.delete(id);
          reject(new RpcTimeoutError(method, timeoutMs));
        }, timeoutMs);
      }
      this.#pending.set(id, entry);
      this.#post({ type: "call", id, method, args });
    });
  }

  notify(method: string, args: unknown[] = []) {
    if (!this.#closed) this.#post({ type: "notify", method, args });
  }

  /** How many calls are waiting for an answer. */
  get pending() {
    return this.#pending.size;
  }

  /** Handles a message from the other side. */
  async receive(message: Message) {
    if (this.#closed) return;
    switch (message.type) {
      case "call": {
        try {
          const value = await this.handlers.call?.(
            message.method,
            message.args,
          );
          this.#post({ type: "result", id: message.id, ok: true, value });
        } catch (error) {
          this.#post({
            type: "result",
            id: message.id,
            ok: false,
            error: errorText(error),
          });
        }
        break;
      }
      case "result": {
        const entry = this.#pending.get(message.id);
        if (!entry) return;
        this.#pending.delete(message.id);
        clearTimeout(entry.timer);
        if (message.ok) entry.resolve(message.value);
        else entry.reject(new Error(message.error));
        break;
      }
      case "notify":
        this.handlers.notify?.(message.method, message.args);
        break;
    }
  }

  /** Stops the connection; waiting calls fail with `reason`. */
  close(reason: string) {
    if (this.#closed) return;
    this.#closed = reason;
    for (const entry of this.#pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error(reason));
    }
    this.#pending.clear();
  }

  #post(message: Message) {
    try {
      this.send(message);
    } catch (error) {
      // Something that can't be cloned (a function, say) was sent.
      if (message.type === "call") {
        const entry = this.#pending.get(message.id);
        this.#pending.delete(message.id);
        clearTimeout(entry?.timer);
        entry?.reject(
          new Error(`Couldn't send "${message.method}": ${errorText(error)}`),
        );
      } else if (message.type === "result") {
        this.send({
          type: "result",
          id: message.id,
          ok: false,
          error: `The answer couldn't be sent: ${errorText(error)}`,
        });
      } else {
        throw error;
      }
    }
  }
}

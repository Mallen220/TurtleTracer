// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  Rpc,
  RpcTimeoutError,
  errorText,
  type Message,
} from "../../lib/plugins/protocol/rpc";

/** Two Rpcs wired to each other directly. */
function pair(
  leftHandlers: ConstructorParameters<typeof Rpc>[1] = {},
  rightHandlers: ConstructorParameters<typeof Rpc>[1] = {},
) {
  let left: Rpc;
  let right: Rpc;
  left = new Rpc((m) => queueMicrotask(() => right.receive(m)), leftHandlers);
  right = new Rpc((m) => queueMicrotask(() => left.receive(m)), rightHandlers);
  return { left, right };
}

afterEach(() => vi.useRealTimers());

describe("Rpc", () => {
  it("answers calls with what the handler returns", async () => {
    const { left } = pair(
      {},
      { call: async (method, args) => `${method}:${args.join(",")}` },
    );
    await expect(left.call("echo", [1, 2])).resolves.toBe("echo:1,2");
  });

  it("sends a thrown error back as a failed call", async () => {
    const { left } = pair(
      {},
      {
        call: () => {
          throw new Error("nope");
        },
      },
    );
    await expect(left.call("x")).rejects.toThrow("nope");
  });

  it("delivers notifications without answering them", async () => {
    const notify = vi.fn();
    const { left } = pair({}, { notify });
    left.notify("ping", ["a"]);
    await new Promise((r) => setTimeout(r));
    expect(notify).toHaveBeenCalledWith("ping", ["a"]);
  });

  it("gives up on a call that isn't answered in time", async () => {
    vi.useFakeTimers();
    const rpc = new Rpc(() => {}, {});
    const call = rpc.call("slow", [], 100);
    const check = expect(call).rejects.toBeInstanceOf(RpcTimeoutError);
    vi.advanceTimersByTime(101);
    await check;
    expect(rpc.pending).toBe(0);
  });

  it("fails waiting calls when closed, and refuses new ones", async () => {
    const rpc = new Rpc(() => {}, {});
    const waiting = rpc.call("x");
    rpc.close("stopped");
    await expect(waiting).rejects.toThrow("stopped");
    await expect(rpc.call("y")).rejects.toThrow("stopped");
  });

  it("ignores answers to calls it doesn't know about", async () => {
    const rpc = new Rpc(() => {}, {});
    await rpc.receive({ type: "result", id: 99, ok: true, value: 1 });
    expect(rpc.pending).toBe(0);
  });

  it("rejects a call whose arguments can't be sent", async () => {
    const send = vi.fn((m: Message) => {
      structuredClone(m);
    });
    const rpc = new Rpc(send, {});
    await expect(rpc.call("x", [() => 1])).rejects.toThrow(/Couldn't send/);
  });

  it("sends a failure when an answer can't be sent", async () => {
    const sent: Message[] = [];
    const rpc = new Rpc(
      (m) => {
        structuredClone(m);
        sent.push(m);
      },
      { call: () => () => "a function" },
    );
    await rpc.receive({ type: "call", id: 1, method: "x", args: [] });
    expect(sent[0]).toMatchObject({ type: "result", id: 1, ok: false });
  });
});

describe("errorText", () => {
  it("keeps error messages short", () => {
    expect(errorText(new Error("x".repeat(3000)))).toHaveLength(2001);
    expect(errorText("plain")).toBe("plain");
  });
});

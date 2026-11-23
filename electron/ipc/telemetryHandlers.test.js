// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";

const fake = vi.hoisted(() => {
  const state = {
    ws: [],
    tcp: [],
    handlers: new Map(),
    constructorFails: false,
  };

  /** A socket that records its listeners so a test can fire them. */
  class FakeSocket {
    listeners = {};
    closed = false;
    on(event, listener) {
      this.listeners[event] = listener;
    }
    emit(event, ...args) {
      this.listeners[event]?.(...args);
    }
  }

  class FakeWebSocket extends FakeSocket {
    constructor(url, options) {
      super();
      if (state.constructorFails) throw new Error("bad url");
      this.url = url;
      this.options = options;
      state.ws.push(this);
    }
    terminate() {
      this.closed = true;
    }
  }

  class FakeTcpSocket extends FakeSocket {
    constructor() {
      super();
      state.tcp.push(this);
    }
    setEncoding(encoding) {
      this.encoding = encoding;
    }
    setTimeout(ms, onTimeout) {
      this.timeoutMs = ms;
      if (onTimeout) this.onTimeout = onTimeout;
    }
    connect(port, ip, onConnect) {
      this.target = { port, ip };
      this.onConnect = onConnect;
    }
    destroy(error) {
      this.closed = true;
      if (error) this.emit("error", error);
    }
  }

  return { state, FakeWebSocket, FakeTcpSocket };
});

const sockets = fake.state;

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel, handler) => sockets.handlers.set(channel, handler),
  },
}));
vi.mock("ws", () => ({ WebSocket: fake.FakeWebSocket }));
vi.mock("node:net", () => ({ default: { Socket: fake.FakeTcpSocket } }));

const { registerTelemetryHandlers } = await import("./telemetryHandlers.js");

function windowSender() {
  const sender = {
    sent: [],
    destroyed: false,
    isDestroyed: () => sender.destroyed,
    once: (event, listener) => (sender.onceListeners[event] = listener),
    onceListeners: {},
    send: (channel, payload) => sender.sent.push([channel, payload]),
  };
  return sender;
}

const connect = (sender, ...args) =>
  sockets.handlers.get("telemetry:connect")({ sender }, ...args);
const disconnect = (sender) =>
  sockets.handlers.get("telemetry:disconnect")({ sender });

beforeEach(() => {
  sockets.ws.length = 0;
  sockets.tcp.length = 0;
  sockets.handlers.clear();
  sockets.constructorFails = false;
  registerTelemetryHandlers();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("telemetry over a WebSocket", () => {
  it("connects to the robot's telemetry endpoint and reports each stage", async () => {
    const sender = windowSender();
    expect(await connect(sender, "192.168.43.1", 8080, "websocket")).toBe(true);

    const [socket] = sockets.ws;
    expect(socket.url).toBe("ws://192.168.43.1:8080/telemetry");
    expect(sender.sent).toEqual([["telemetry:status", "CONNECTING"]]);

    socket.emit("open");
    socket.emit("message", Buffer.from('{"x":1}'));
    socket.emit("error", new Error("boom"));
    socket.emit("close");
    expect(sender.sent).toEqual([
      ["telemetry:status", "CONNECTING"],
      ["telemetry:status", "CONNECTED"],
      ["telemetry:data", '{"x":1}'],
      ["telemetry:status", "ERROR"],
      ["telemetry:status", "DISCONNECTED"],
    ]);
  });

  it("stops sending once the window has been closed", async () => {
    const sender = windowSender();
    await connect(sender, "10.0.0.2", 1234, "websocket");
    sender.destroyed = true;
    const sentBefore = sender.sent.length;

    const [socket] = sockets.ws;
    socket.emit("open");
    socket.emit("message", "late");
    socket.emit("error", new Error("late"));
    socket.emit("close");
    expect(sender.sent).toHaveLength(sentBefore);
  });
});

describe("telemetry over TCP", () => {
  it("is the default protocol", async () => {
    const sender = windowSender();
    expect(await connect(sender, "10.0.0.2", 5555)).toBe(true);

    const [socket] = sockets.tcp;
    expect(sockets.ws).toHaveLength(0);
    expect(socket.encoding).toBe("utf8");
    expect(socket.target).toEqual({ port: 5555, ip: "10.0.0.2" });
    expect(sender.sent).toEqual([["telemetry:status", "CONNECTING"]]);

    socket.onConnect();
    socket.emit("error", new Error("boom"));
    socket.emit("close");
    expect(sender.sent.slice(1)).toEqual([
      ["telemetry:status", "CONNECTED"],
      ["telemetry:status", "ERROR"],
      ["telemetry:status", "DISCONNECTED"],
    ]);
  });

  it("sends one message per line, holding back a partial line until it's finished", async () => {
    const sender = windowSender();
    await connect(sender, "10.0.0.2", 5555, "tcp");
    const [socket] = sockets.tcp;

    socket.emit("data", "first\nsec");
    socket.emit("data", "ond\n\n   \nthird");
    socket.emit("data", "\n");
    expect(sender.sent.slice(1)).toEqual([
      ["telemetry:data", "first"],
      ["telemetry:data", "second"],
      ["telemetry:data", "third"],
    ]);
  });
});

describe("reconnecting and disconnecting", () => {
  it("closes the previous socket before opening a new one", async () => {
    const sender = windowSender();
    await connect(sender, "10.0.0.2", 1, "websocket");
    await connect(sender, "10.0.0.2", 2, "tcp");
    expect(sockets.ws[0].closed).toBe(true);

    await connect(sender, "10.0.0.2", 3, "websocket");
    expect(sockets.tcp[0].closed).toBe(true);
  });

  it("carries on if the old socket can't be closed", async () => {
    const sender = windowSender();
    await connect(sender, "10.0.0.2", 1, "tcp");
    sockets.tcp[0].destroy = () => {
      throw new Error("stuck");
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await connect(sender, "10.0.0.2", 2, "tcp")).toBe(true);
    expect(sockets.tcp).toHaveLength(2);
  });

  it("the old socket's late close doesn't disturb the new connection", async () => {
    const sender = windowSender();
    await connect(sender, "10.0.0.2", 1, "tcp");
    const [oldSocket] = sockets.tcp;
    await connect(sender, "10.0.0.2", 1, "tcp");
    const [, newSocket] = sockets.tcp;
    newSocket.onConnect();

    // A closed socket reports its close after the new one is in place.
    oldSocket.emit("error", new Error("reset"));
    oldSocket.emit("close");
    expect(sender.sent.map(([, status]) => status)).toEqual([
      "CONNECTING",
      "CONNECTING",
      "CONNECTED",
    ]);

    // The new connection can still be closed from the window.
    await disconnect(sender);
    expect(newSocket.closed).toBe(true);
    expect(sender.sent.at(-1)).toEqual(["telemetry:status", "DISCONNECTED"]);
  });

  it("keeps each window's connection apart", async () => {
    const first = windowSender();
    const second = windowSender();
    await connect(first, "10.0.0.2", 1, "tcp");
    await connect(second, "10.0.0.3", 2, "tcp");
    expect(sockets.tcp[0].closed).toBe(false);

    await disconnect(second);
    expect(sockets.tcp[0].closed).toBe(false);
    expect(sockets.tcp[1].closed).toBe(true);
  });

  it("drops the connection when its window is closed", async () => {
    const sender = windowSender();
    await connect(sender, "10.0.0.2", 1, "tcp");
    sender.onceListeners.destroyed();
    expect(sockets.tcp[0].closed).toBe(true);
  });

  it("disconnecting closes the socket and tells the window", async () => {
    const sender = windowSender();
    await connect(sender, "10.0.0.2", 1, "tcp");
    expect(await disconnect(sender)).toBe(true);
    expect(sockets.tcp[0].closed).toBe(true);
    expect(sender.sent.at(-1)).toEqual(["telemetry:status", "DISCONNECTED"]);
  });

  it("disconnecting with nothing connected is fine and says nothing", async () => {
    const sender = windowSender();
    expect(await disconnect(sender)).toBe(true);
    expect(sender.sent).toEqual([]);
  });

  it("a socket that closes by itself can't be closed again later", async () => {
    const sender = windowSender();
    await connect(sender, "10.0.0.2", 1, "websocket");
    sockets.ws[0].emit("close");
    const before = sender.sent.length;
    await disconnect(sender);
    expect(sockets.ws[0].closed).toBe(false);
    expect(sender.sent).toHaveLength(before);
  });

  it("reports false when the WebSocket can't be created", async () => {
    sockets.constructorFails = true;
    const sender = windowSender();
    expect(await connect(sender, "10.0.0.2", 1, "websocket")).toBe(false);
    expect(sender.sent).toEqual([]);
  });
});

describe("limits", () => {
  it.each([
    ["10.0.0.2/evil?x=1", 8080],
    ["host name", 8080],
    ["user@10.0.0.2", 8080],
    ["", 8080],
    [undefined, 8080],
    ["10.0.0.2", 0],
    ["10.0.0.2", 70000],
    ["10.0.0.2", "80/x"],
    ["10.0.0.2", 1.5],
  ])("refuses %j port %j", async (ip, port) => {
    const sender = windowSender();
    expect(await connect(sender, ip, port, "websocket")).toBe(false);
    expect(await connect(sender, ip, port, "tcp")).toBe(false);
    expect(sockets.ws).toHaveLength(0);
    expect(sockets.tcp).toHaveLength(0);
    expect(sender.sent).toEqual([]);
  });

  it("accepts a port given as text", async () => {
    expect(await connect(windowSender(), "robot.local", "8080", "tcp")).toBe(
      true,
    );
  });

  it("brackets an IPv6 address in the WebSocket address", async () => {
    await connect(windowSender(), "fe80::1", 8080, "websocket");
    expect(sockets.ws[0].url).toBe("ws://[fe80::1]:8080/telemetry");
  });

  it("gives the WebSocket handshake a time limit", async () => {
    await connect(windowSender(), "10.0.0.2", 8080, "websocket");
    expect(sockets.ws[0].options.handshakeTimeout).toBe(10_000);
  });

  it("gives up on a TCP connection that never completes", async () => {
    const sender = windowSender();
    await connect(sender, "10.0.0.2", 5555, "tcp");
    const [socket] = sockets.tcp;
    expect(socket.timeoutMs).toBe(10_000);
    socket.onTimeout();
    expect(socket.closed).toBe(true);
    expect(sender.sent.at(-1)).toEqual(["telemetry:status", "ERROR"]);
  });

  it("stops timing a TCP connection once it is made", async () => {
    await connect(windowSender(), "10.0.0.2", 5555, "tcp");
    const [socket] = sockets.tcp;
    socket.onConnect();
    expect(socket.timeoutMs).toBe(0);
  });

  it("drops a connection that sends a huge line with no end", async () => {
    const sender = windowSender();
    await connect(sender, "10.0.0.2", 5555, "tcp");
    const [socket] = sockets.tcp;
    socket.emit("data", "x".repeat(600_000));
    expect(socket.closed).toBe(false);
    socket.emit("data", "x".repeat(600_000));
    expect(socket.closed).toBe(true);
    expect(sender.sent.at(-1)).toEqual(["telemetry:status", "ERROR"]);
    expect(sender.sent.some(([channel]) => channel === "telemetry:data")).toBe(
      false,
    );
  });

  it("still passes a long line that does end", async () => {
    const sender = windowSender();
    await connect(sender, "10.0.0.2", 5555, "tcp");
    sockets.tcp[0].emit("data", `${"y".repeat(900_000)}\n`);
    expect(sender.sent.at(-1)[0]).toBe("telemetry:data");
  });
});

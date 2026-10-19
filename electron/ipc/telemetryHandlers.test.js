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
    constructor(url) {
      super();
      if (state.constructorFails) throw new Error("bad url");
      this.url = url;
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
    connect(port, ip, onConnect) {
      this.target = { port, ip };
      this.onConnect = onConnect;
    }
    destroy() {
      this.closed = true;
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
    send: (channel, payload) => sender.sent.push([channel, payload]),
  };
  return sender;
}

const connect = (sender, ...args) =>
  sockets.handlers.get("telemetry:connect")({ sender }, ...args);
const disconnect = (sender) =>
  sockets.handlers.get("telemetry:disconnect")({ sender });

beforeEach(async () => {
  sockets.ws.length = 0;
  sockets.tcp.length = 0;
  sockets.handlers.clear();
  sockets.constructorFails = false;
  registerTelemetryHandlers();
  // Drop whatever socket the previous test left connected.
  await disconnect(windowSender());
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
    await connect(windowSender(), "10.0.0.2", 1, "websocket");
    await connect(windowSender(), "10.0.0.2", 2, "tcp");
    expect(sockets.ws[0].closed).toBe(true);

    await connect(windowSender(), "10.0.0.2", 3, "websocket");
    expect(sockets.tcp[0].closed).toBe(true);
  });

  it("carries on if the old socket can't be closed", async () => {
    await connect(windowSender(), "10.0.0.2", 1, "tcp");
    sockets.tcp[0].destroy = () => {
      throw new Error("stuck");
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await connect(windowSender(), "10.0.0.2", 2, "tcp")).toBe(true);
    expect(sockets.tcp).toHaveLength(2);
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

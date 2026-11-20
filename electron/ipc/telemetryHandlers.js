// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { ipcMain } from "electron";
import { WebSocket } from "ws";
import net from "node:net";

/** A line longer than this is not telemetry; the connection is dropped. */
const MAX_LINE_LENGTH = 1_000_000;
const CONNECT_TIMEOUT_MS = 10_000;
/** A host name or IP address, with nothing that could change the URL. */
const HOST_PATTERN = /^[A-Za-z0-9._:-]+$/;

/** The robot connection of each window, by the window's web contents. */
const connections = new Map();
/** Windows already set to drop their connection when they close. */
const watched = new WeakSet();

/** Sends to the window that connected, unless it has been closed since. */
function sendTo(sender, channel, payload) {
  if (!sender.isDestroyed()) {
    sender.send(channel, payload);
  }
}

function closeSocket(socket) {
  if (socket instanceof WebSocket) {
    socket.terminate();
  } else {
    socket.destroy();
  }
}

/** Closes the window's connection, if any, without reporting it. */
function dropConnection(sender) {
  const socket = connections.get(sender);
  if (!socket) return false;
  connections.delete(sender);
  try {
    closeSocket(socket);
  } catch (e) {
    console.warn("Error terminating existing socket:", e);
  }
  return true;
}

function isValidTarget(ip, port) {
  const number = Number(port);
  return (
    typeof ip === "string" &&
    ip.length <= 253 &&
    HOST_PATTERN.test(ip) &&
    Number.isInteger(number) &&
    number >= 1 &&
    number <= 65535
  );
}

/**
 * Tells the window when the socket closes or fails. A socket that has been
 * replaced or disconnected is no longer the window's, and says nothing: its
 * close event arrives after the new connection is already in place.
 * `label` names the protocol in the log.
 */
function reportClosingAndErrors(socket, sender, label) {
  const isCurrent = () => connections.get(sender) === socket;

  socket.on("close", () => {
    if (!isCurrent()) return;
    console.log(`Telemetry disconnected (${label})`);
    connections.delete(sender);
    sendTo(sender, "telemetry:status", "DISCONNECTED");
  });

  socket.on("error", (err) => {
    if (!isCurrent()) return;
    console.error(`Telemetry error (${label}):`, err);
    sendTo(sender, "telemetry:status", "ERROR");
  });
}

function connectWebSocket(sender, ip, port) {
  const host = ip.includes(":") ? `[${ip}]` : ip;
  const url = `ws://${host}:${port}/telemetry`;
  console.log(`Attempting to connect to telemetry (WS) at ${url}`);

  const socket = new WebSocket(url, { handshakeTimeout: CONNECT_TIMEOUT_MS });
  connections.set(sender, socket);

  socket.on("open", () => {
    if (connections.get(sender) !== socket) return;
    console.log("Telemetry connected (WS)");
    sendTo(sender, "telemetry:status", "CONNECTED");
  });

  socket.on("message", (data) => {
    if (connections.get(sender) !== socket) return;
    sendTo(sender, "telemetry:data", data.toString());
  });

  reportClosingAndErrors(socket, sender, "WS");
}

function connectTcp(sender, ip, port) {
  console.log(`Attempting to connect to telemetry (TCP) at ${ip}:${port}`);

  const socket = new net.Socket();
  connections.set(sender, socket);
  socket.setEncoding("utf8"); // Ensure strings
  // Only the connecting is timed; a quiet robot is still connected.
  socket.setTimeout(CONNECT_TIMEOUT_MS, () =>
    socket.destroy(new Error("Connection timed out")),
  );
  let buffer = "";

  socket.connect(port, ip, () => {
    socket.setTimeout(0);
    console.log("Telemetry connected (TCP)");
    sendTo(sender, "telemetry:status", "CONNECTED");
  });

  socket.on("data", (data) => {
    if (connections.get(sender) !== socket) return;
    buffer += data;
    let boundary = buffer.indexOf("\n");
    while (boundary !== -1) {
      const line = buffer.slice(0, Math.max(0, boundary));
      buffer = buffer.slice(Math.max(0, boundary + 1));
      if (line.trim().length > 0) {
        sendTo(sender, "telemetry:data", line);
      }
      boundary = buffer.indexOf("\n");
    }
    if (buffer.length > MAX_LINE_LENGTH) {
      console.error("Telemetry line too long; dropping the connection");
      dropConnection(sender);
      sendTo(sender, "telemetry:status", "ERROR");
    }
  });

  reportClosingAndErrors(socket, sender, "TCP");
}

export function registerTelemetryHandlers() {
  ipcMain.handle(
    "telemetry:connect",
    async (event, ip, port, protocol = "tcp") => {
      const sender = event.sender;
      dropConnection(sender);

      if (!isValidTarget(ip, port)) {
        console.warn("Refusing telemetry connection to an invalid address");
        return false;
      }

      if (!watched.has(sender)) {
        watched.add(sender);
        // A closed window must not keep a robot connection open.
        sender.once?.("destroyed", () => dropConnection(sender));
      }

      try {
        if (protocol === "websocket") {
          connectWebSocket(sender, ip, port);
        } else {
          connectTcp(sender, ip, port);
        }
        sender.send("telemetry:status", "CONNECTING");
        return true;
      } catch (e) {
        console.error(`Failed to create ${protocol} socket:`, e);
        dropConnection(sender);
        return false;
      }
    },
  );

  ipcMain.handle("telemetry:disconnect", async (event) => {
    if (dropConnection(event.sender)) {
      sendTo(event.sender, "telemetry:status", "DISCONNECTED");
    }
    return true;
  });
}

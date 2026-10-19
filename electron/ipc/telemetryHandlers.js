// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { ipcMain } from "electron";
import { WebSocket } from "ws";
import net from "node:net";

let telemetrySocket = null;

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

/** Tells the window when the socket closes or fails. `label` names the protocol in the log. */
function reportClosingAndErrors(socket, sender, label) {
  socket.on("close", () => {
    console.log(`Telemetry disconnected (${label})`);
    sendTo(sender, "telemetry:status", "DISCONNECTED");
    telemetrySocket = null;
  });

  socket.on("error", (err) => {
    console.error(`Telemetry error (${label}):`, err);
    sendTo(sender, "telemetry:status", "ERROR");
  });
}

export function registerTelemetryHandlers() {
  ipcMain.handle(
    "telemetry:connect",
    async (event, ip, port, protocol = "tcp") => {
      if (telemetrySocket) {
        try {
          closeSocket(telemetrySocket);
        } catch (e) {
          console.warn("Error terminating existing socket:", e);
        }
        telemetrySocket = null;
      }

      if (protocol === "websocket") {
        const url = `ws://${ip}:${port}/telemetry`;
        console.log(`Attempting to connect to telemetry (WS) at ${url}`);

        try {
          telemetrySocket = new WebSocket(url);

          telemetrySocket.on("open", () => {
            console.log("Telemetry connected (WS)");
            sendTo(event.sender, "telemetry:status", "CONNECTED");
          });

          telemetrySocket.on("message", (data) => {
            sendTo(event.sender, "telemetry:data", data.toString());
          });

          reportClosingAndErrors(telemetrySocket, event.sender, "WS");

          event.sender.send("telemetry:status", "CONNECTING");
          return true;
        } catch (e) {
          console.error("Failed to create WebSocket:", e);
          return false;
        }
      } else {
        // TCP Mode
        console.log(
          `Attempting to connect to telemetry (TCP) at ${ip}:${port}`,
        );
        try {
          telemetrySocket = new net.Socket();
          telemetrySocket.setEncoding("utf8"); // Ensure strings
          let buffer = "";

          telemetrySocket.connect(port, ip, () => {
            console.log("Telemetry connected (TCP)");
            sendTo(event.sender, "telemetry:status", "CONNECTED");
          });

          telemetrySocket.on("data", (data) => {
            buffer += data;
            let boundary = buffer.indexOf("\n");
            while (boundary !== -1) {
              const line = buffer.slice(0, Math.max(0, boundary));
              buffer = buffer.slice(Math.max(0, boundary + 1));
              if (line.trim().length > 0) {
                sendTo(event.sender, "telemetry:data", line);
              }
              boundary = buffer.indexOf("\n");
            }
          });

          reportClosingAndErrors(telemetrySocket, event.sender, "TCP");

          event.sender.send("telemetry:status", "CONNECTING");
          return true;
        } catch (e) {
          console.error("Failed to create TCP Socket:", e);
          return false;
        }
      }
    },
  );

  ipcMain.handle("telemetry:disconnect", async (event) => {
    if (telemetrySocket) {
      closeSocket(telemetrySocket);
      telemetrySocket = null;
      sendTo(event.sender, "telemetry:status", "DISCONNECTED");
    }
    return true;
  });
}

import { ipcMain } from "electron";
import { WebSocket } from "ws";
import net from "net";

let telemetrySocket = null;

export function registerTelemetryHandlers() {
  ipcMain.handle(
    "telemetry:connect",
    async (event, ip, port, protocol = "tcp") => {
      if (telemetrySocket) {
        try {
          if (telemetrySocket instanceof WebSocket) {
            telemetrySocket.terminate();
          } else {
            telemetrySocket.destroy();
          }
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
            if (!event.sender.isDestroyed()) {
              event.sender.send("telemetry:status", "CONNECTED");
            }
          });

          telemetrySocket.on("message", (data) => {
            if (!event.sender.isDestroyed()) {
              event.sender.send("telemetry:data", data.toString());
            }
          });

          telemetrySocket.on("close", () => {
            console.log("Telemetry disconnected (WS)");
            if (!event.sender.isDestroyed()) {
              event.sender.send("telemetry:status", "DISCONNECTED");
            }
            telemetrySocket = null;
          });

          telemetrySocket.on("error", (err) => {
            console.error("Telemetry error (WS):", err);
            if (!event.sender.isDestroyed()) {
              event.sender.send("telemetry:status", "ERROR");
            }
          });

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
            if (!event.sender.isDestroyed()) {
              event.sender.send("telemetry:status", "CONNECTED");
            }
          });

          telemetrySocket.on("data", (data) => {
            buffer += data;
            let boundary = buffer.indexOf("\n");
            while (boundary !== -1) {
              const line = buffer.substring(0, boundary);
              buffer = buffer.substring(boundary + 1);
              if (line.trim().length > 0) {
                if (!event.sender.isDestroyed()) {
                  event.sender.send("telemetry:data", line);
                }
              }
              boundary = buffer.indexOf("\n");
            }
          });

          telemetrySocket.on("close", () => {
            console.log("Telemetry disconnected (TCP)");
            if (!event.sender.isDestroyed()) {
              event.sender.send("telemetry:status", "DISCONNECTED");
            }
            telemetrySocket = null;
          });

          telemetrySocket.on("error", (err) => {
            console.error("Telemetry error (TCP):", err);
            if (!event.sender.isDestroyed()) {
              event.sender.send("telemetry:status", "ERROR");
            }
          });

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
      if (telemetrySocket instanceof WebSocket) {
        telemetrySocket.terminate();
      } else {
        telemetrySocket.destroy();
      }
      telemetrySocket = null;
      if (!event.sender.isDestroyed()) {
        event.sender.send("telemetry:status", "DISCONNECTED");
      }
    }
    return true;
  });
}

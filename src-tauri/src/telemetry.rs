// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
//! Live robot telemetry over TCP (one JSON message per line) or WebSocket.
//! One connection at a time; its messages go to the window that opened it.
use std::sync::Mutex;
#[cfg(test)]
use std::time::Duration;

use futures_util::StreamExt;
use tauri::async_runtime::JoinHandle;
use tauri::{Emitter, Runtime, WebviewWindow};
use tokio::io::AsyncReadExt;
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;

#[derive(Default)]
pub struct Telemetry {
    connection: Mutex<Option<JoinHandle<()>>>,
}

impl Telemetry {
    /// Swaps in the next connection, closing the current one. Returns whether
    /// one was still open (one that closed by itself has said so already).
    fn replace(&self, next: Option<JoinHandle<()>>) -> bool {
        let previous = std::mem::replace(&mut *self.connection.lock().unwrap(), next);
        match previous {
            Some(task) if !task.inner().is_finished() => {
                task.abort();
                true
            }
            _ => false,
        }
    }
}

/// Splits a TCP stream into lines, keeping a partial line for the next read.
#[derive(Default)]
pub struct LineSplitter {
    buffer: String,
}

impl LineSplitter {
    pub fn push(&mut self, chunk: &str) -> Vec<String> {
        self.buffer.push_str(chunk);
        let mut lines = Vec::new();
        while let Some(end) = self.buffer.find('\n') {
            let line: String = self.buffer.drain(..=end).collect();
            let line = &line[..line.len() - 1];
            if !line.trim().is_empty() {
                lines.push(line.to_string());
            }
        }
        lines
    }
}

/// Where a connection's news goes: the window that opened it.
pub trait Sink: Send + 'static {
    fn send(&self, event: &str, payload: String);
}

impl<R: Runtime> Sink for WebviewWindow<R> {
    fn send(&self, event: &str, payload: String) {
        let _ = self.emit_to(self.label(), event, payload);
    }
}

struct Reporter<S: Sink> {
    sink: S,
    label: &'static str,
}

impl<S: Sink> Reporter<S> {
    fn status(&self, status: &str) {
        self.sink.send("telemetry:status", status.into());
    }
    fn data(&self, data: String) {
        self.sink.send("telemetry:data", data);
    }
    fn connected(&self) {
        println!("Telemetry connected ({})", self.label);
        self.status("CONNECTED");
    }
    fn error(&self, err: impl std::fmt::Display) {
        eprintln!("Telemetry error ({}): {err}", self.label);
        self.status("ERROR");
    }
    fn closed(&self) {
        println!("Telemetry disconnected ({})", self.label);
        self.status("DISCONNECTED");
    }
}

async fn run_tcp<S: Sink>(report: Reporter<S>, ip: String, port: u16) {
    let mut stream = match TcpStream::connect((ip.as_str(), port)).await {
        Ok(stream) => stream,
        Err(e) => {
            report.error(e);
            return report.closed();
        }
    };
    report.connected();
    let mut splitter = LineSplitter::default();
    let mut bytes = Vec::new();
    let mut chunk = [0u8; 8192];
    loop {
        match stream.read(&mut chunk).await {
            Ok(0) => break,
            Ok(n) => {
                // Keep a multi-byte character split across reads for the next one.
                bytes.extend_from_slice(&chunk[..n]);
                let valid = match std::str::from_utf8(&bytes) {
                    Ok(_) => bytes.len(),
                    Err(e) if e.error_len().is_none() => e.valid_up_to(),
                    Err(_) => bytes.len(),
                };
                let text = String::from_utf8_lossy(&bytes[..valid]).into_owned();
                bytes.drain(..valid);
                for line in splitter.push(&text) {
                    report.data(line);
                }
            }
            Err(e) => {
                report.error(e);
                break;
            }
        }
    }
    report.closed();
}

async fn run_ws<S: Sink>(report: Reporter<S>, url: String) {
    let mut socket = match tokio_tungstenite::connect_async(url.as_str()).await {
        Ok((socket, _)) => socket,
        Err(e) => {
            report.error(e);
            return report.closed();
        }
    };
    report.connected();
    while let Some(message) = socket.next().await {
        match message {
            Ok(Message::Text(text)) => report.data(text.to_string()),
            Ok(Message::Binary(bytes)) => report.data(String::from_utf8_lossy(&bytes).into_owned()),
            Ok(Message::Close(_)) => break,
            Ok(_) => {}
            Err(e) => {
                report.error(e);
                break;
            }
        }
    }
    report.closed();
}

#[tauri::command]
pub fn telemetry_connect<R: Runtime>(
    window: WebviewWindow<R>,
    telemetry: tauri::State<'_, Telemetry>,
    ip: String,
    port: u16,
    protocol: Option<String>,
) -> bool {
    telemetry.replace(None);
    let websocket = protocol.as_deref() == Some("websocket");
    let label = if websocket { "WS" } else { "TCP" };
    let report = Reporter {
        sink: window.clone(),
        label,
    };
    report.status("CONNECTING");
    let task = if websocket {
        let url = format!("ws://{ip}:{port}/telemetry");
        println!("Attempting to connect to telemetry (WS) at {url}");
        tauri::async_runtime::spawn(run_ws(report, url))
    } else {
        println!("Attempting to connect to telemetry (TCP) at {ip}:{port}");
        tauri::async_runtime::spawn(run_tcp(report, ip, port))
    };
    telemetry.replace(Some(task));
    true
}

#[tauri::command]
pub fn telemetry_disconnect<R: Runtime>(
    window: WebviewWindow<R>,
    telemetry: tauri::State<'_, Telemetry>,
) -> bool {
    if telemetry.replace(None) {
        let _ = window.emit_to(window.label(), "telemetry:status", "DISCONNECTED");
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::SinkExt;
    use std::sync::mpsc;
    use tokio::io::AsyncWriteExt;
    use tokio::net::TcpListener;

    struct Channel(mpsc::Sender<(String, String)>);

    impl Sink for Channel {
        fn send(&self, event: &str, payload: String) {
            let _ = self.0.send((event.into(), payload));
        }
    }

    fn reporter(label: &'static str) -> (Reporter<Channel>, mpsc::Receiver<(String, String)>) {
        let (tx, rx) = mpsc::channel();
        (
            Reporter {
                sink: Channel(tx),
                label,
            },
            rx,
        )
    }

    fn status(s: &str) -> (String, String) {
        ("telemetry:status".into(), s.into())
    }

    fn data(s: &str) -> (String, String) {
        ("telemetry:data".into(), s.into())
    }

    #[tokio::test]
    async fn tcp_sends_one_message_per_line_and_reports_each_stage() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            socket
                .write_all("{\"x\":1}\n{\"name\":\"tü".as_bytes())
                .await
                .unwrap();
            socket.flush().await.unwrap();
            tokio::time::sleep(Duration::from_millis(50)).await;
            socket.write_all("rtle\"}\n".as_bytes()).await.unwrap();
        });
        let (report, rx) = reporter("TCP");
        run_tcp(report, "127.0.0.1".into(), port).await;
        let events: Vec<_> = rx.try_iter().collect();
        assert_eq!(
            events,
            vec![
                status("CONNECTED"),
                data("{\"x\":1}"),
                data("{\"name\":\"türtle\"}"),
                status("DISCONNECTED"),
            ]
        );
    }

    #[tokio::test]
    async fn a_connection_that_fails_reports_an_error_then_closes() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let (report, rx) = reporter("TCP");
        run_tcp(report, "127.0.0.1".into(), port).await;
        let events: Vec<_> = rx.try_iter().collect();
        assert_eq!(events, vec![status("ERROR"), status("DISCONNECTED")]);
    }

    #[tokio::test]
    #[allow(clippy::result_large_err)] // tungstenite's handshake callback type
    async fn websocket_connects_to_the_telemetry_endpoint() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let (path_tx, path_rx) = tokio::sync::oneshot::channel();
        tokio::spawn(async move {
            let (socket, _) = listener.accept().await.unwrap();
            let mut path_tx = Some(path_tx);
            let callback = |req: &tokio_tungstenite::tungstenite::handshake::server::Request,
                            res| {
                let _ = path_tx.take().unwrap().send(req.uri().path().to_string());
                Ok(res)
            };
            let mut ws = tokio_tungstenite::accept_hdr_async(socket, callback)
                .await
                .unwrap();
            ws.send(Message::text("{\"x\":2}")).await.unwrap();
            ws.close(None).await.unwrap();
        });
        let (report, rx) = reporter("WS");
        run_ws(report, format!("ws://127.0.0.1:{port}/telemetry")).await;
        assert_eq!(path_rx.await.unwrap(), "/telemetry");
        let events: Vec<_> = rx.try_iter().collect();
        assert_eq!(
            events,
            vec![
                status("CONNECTED"),
                data("{\"x\":2}"),
                status("DISCONNECTED")
            ]
        );
    }

    #[test]
    fn splits_lines_across_chunks_and_drops_blank_ones() {
        let mut s = LineSplitter::default();
        assert_eq!(s.push("{\"x\":1}\n{\"x\""), vec!["{\"x\":1}"]);
        assert_eq!(s.push(":2}\n\n  \n"), vec!["{\"x\":2}"]);
        assert!(s.push("partial").is_empty());
        assert_eq!(s.push("\r\n"), vec!["partial\r"]);
    }
}

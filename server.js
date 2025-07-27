// server.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = new Map(); // ws => { id, mic, muted }

let clientId = 1;

app.use(express.static("public")); // UI varsa buraya koyarsın

// Panel - http://localhost:3000/
app.get("/", (req, res) => {
  let html = `<h2>🎙️ Sesli Sohbet Durumu</h2><ul>`;
  for (const [ws, info] of clients.entries()) {
    html += `<li><b>#${info.id}</b> — ${info.mic ? "🎤 Mic Açık" : "🔇 Mic Kapalı"} ${info.muted ? "🚫 Mute Edildi" : ""}</li>`;
  }
  html += `</ul><p>Toplam Bağlı: ${clients.size}</p>`;
  res.send(html);
});

wss.on("connection", function connection(ws) {
  const id = clientId++;
  clients.set(ws, { id, mic: false, muted: false });

  ws.on("message", function incoming(message) {
    try {
      const msg = JSON.parse(message);

      if (msg.type === "signal") {
        // WebRTC sinyali diğer herkese gönder
        wss.clients.forEach(function each(client) {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "signal", data: msg.data }));
          }
        });
      } else if (msg.type === "mic") {
        const info = clients.get(ws);
        if (info) info.mic = msg.status;
      } else if (msg.type === "speech") {
        // Ses analizi — küfür kontrolü
        const badWords = ["sikim", "soxum", "siktir", "qəhbə", "sik", "anan", "bacın", "peyser", "daşşağ"];
        const saidBad = badWords.some(word => msg.text.toLowerCase().includes(word));
        const info = clients.get(ws);

        if (saidBad && info && !info.muted) {
          info.muted = true;
          info.mic = false;
          // Client'a mute sinyali gönder
          ws.send(JSON.stringify({ type: "mute", reason: "Küfür tespit edildi." }));
          console.log(`#${info.id} otomatik mute edildi (küfür)`);
        }
      }
    } catch (e) {
      console.error("Geçersiz mesaj:", e);
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
  });
});

server.listen(3000, () => {
  console.log("✅ Sesli sohbet sunucusu http://localhost:3000 üzerinde çalışıyor.");
});

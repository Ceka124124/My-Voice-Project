// server.js
// Basit, tek odalı WebRTC Signaling Sunucusu
// ------------------------------------------
const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: "*" } });

/* ---- HTTP endpoint (sağlık testi) ---- */
app.use(cors());
app.get("/", (_, res) => res.send("🟢 WebRTC single-room signaling server aktif"));

/* ---- Tek odalı Socket.IO bölümü ---- */
const ROOM = "global-room";

io.on("connection", socket => {
  console.log("➕ Yeni istemci:", socket.id);
  socket.join(ROOM);               // herkes aynı odaya giriyor

  /* Diğer peer’lere “yeni katılımcı” bildir: */
  socket.to(ROOM).emit("new-peer", socket.id);

  /* Offer / Answer / ICE candidate yönlendirmesi */
  socket.on("signal", data => {
    // data = { target: <socketId>, type: "offer|answer|candidate", sdp|candidate }
    io.to(data.target).emit("signal", { from: socket.id, ...data });
  });

  socket.on("disconnect", () => {
    console.log("➖ Ayrılan:", socket.id);
    socket.to(ROOM).emit("peer-left", socket.id);
  });
});

/* ---- Sunucuyu başlat ---- */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Signaling server ${PORT} portunda çalışıyor`));

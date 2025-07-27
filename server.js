// server.js
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Dışarıdan tüm istekleri kabul et
    methods: ["GET", "POST"]
  }
});

// WebSocket bağlantısı kurma
io.on("connection", (socket) => {
    console.log("🔌 Kullanıcı bağlandı:", socket.id);

    // WebRTC olaylarını relay et
    socket.on("offer", (offer) => {
        socket.broadcast.emit("offer", offer);
    });

    socket.on("answer", (answer) => {
        socket.broadcast.emit("answer", answer);
    });

    socket.on("ice-candidate", (candidate) => {
        socket.broadcast.emit("ice-candidate", candidate);
    });

    socket.on("disconnect", () => {
        console.log("❌ Kullanıcı ayrıldı:", socket.id);
    });
});

// Server'ı başlat
server.listen(3000, () => {
    console.log("✅ WebSocket sunucusu 3000 portunda çalışıyor");
});

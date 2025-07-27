const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Sunucunun root dizinine gelen isteklere index.html dosyasını gönderiyoruz
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html");
});

// WebSocket bağlantısı kurma
io.on("connection", (socket) => {
    console.log("Bir kullanıcı bağlandı");

    // WebRTC ile sesli sohbet başlatmak için gerekli olaylar
    socket.on("offer", (offer) => {
        socket.broadcast.emit("offer", offer);  // Diğer kullanıcılara 'offer' mesajını gönder
    });

    socket.on("answer", (answer) => {
        socket.broadcast.emit("answer", answer);  // Diğer kullanıcılara 'answer' mesajını gönder
    });

    socket.on("ice-candidate", (candidate) => {
        socket.broadcast.emit("ice-candidate", candidate);  // ICE adaylarını paylaşma
    });

    socket.on("disconnect", () => {
        console.log("Bir kullanıcı ayrıldı");
    });
});

// Sunucuyu başlatma
server.listen(3000, () => {
    console.log("Sunucu 3000 portunda çalışıyor");
});

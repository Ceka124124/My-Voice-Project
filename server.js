const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);

// Gecikmeyi minimize etmek için WebSocket öncelikli ayarlar
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
});

// Veri yapıları - Hızlı erişim için Map kullanıldı
const rooms = new Map();      // roomId -> Set(socket.id)
const userSockets = new Map(); // userId -> socket.id
const socketUsers = new Map(); // socket.id -> userData

console.log("🚀 StarVoice Ses Sunucusu başlatılıyor...");

io.on("connection", (socket) => {
    console.log("🔌 Yeni bağlantı:", socket.id);

    // 1. Odaya Katılma
    socket.on("join-room", (data) => {
        const { roomId, userId, username, avatar } = data;

        socket.join(`room_${roomId}`);

        // Kullanıcı verilerini Map'lere kaydet
        const userData = { userId, username, avatar, roomId, socketId: socket.id };
        socketUsers.set(socket.id, userData);
        userSockets.set(userId, socket.id);

        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        rooms.get(roomId).add(socket.id);

        console.log(`✅ ${username} (ID: ${userId}) katıldı: room_${roomId}`);

        // Diğer kullanıcılara bildir
        socket.to(`room_${roomId}`).emit("user-joined", {
            userId,
            username,
            avatar
        });

        // Odaya giren kişiye mevcut kullanıcıları gönder
        const roomUsers = Array.from(rooms.get(roomId))
            .map(sid => socketUsers.get(sid))
            .filter(u => u);

        socket.emit("room-users", roomUsers);
    });

    // 2. WebRTC Sinyalleşme (En Hızlı Yönlendirme)
    socket.on("offer", (data) => {
        const targetSid = userSockets.get(data.targetUserId);
        if (targetSid) {
            io.to(targetSid).emit("offer", {
                offer: data.offer,
                fromUserId: socketUsers.get(socket.id).userId
            });
        }
    });

    socket.on("answer", (data) => {
        const targetSid = userSockets.get(data.targetUserId);
        if (targetSid) {
            io.to(targetSid).emit("answer", {
                answer: data.answer,
                fromUserId: socketUsers.get(socket.id).userId
            });
        }
    });

    socket.on("ice-candidate", (data) => {
        const targetSid = userSockets.get(data.targetUserId);
        if (targetSid) {
            io.to(targetSid).emit("ice-candidate", {
                candidate: data.candidate,
                fromUserId: socketUsers.get(socket.id).userId
            });
        }
    });

    // 3. Koltuk ve Durum Bildirimleri
    socket.on("seat-taken", (data) => {
        socket.to(`room_${data.roomId}`).emit("seat-update-needed");
    });

    socket.on("leave-seat", (data) => {
        socket.to(`room_${data.roomId}`).emit("seat-update-needed");
    });

    socket.on("user-talking", (data) => {
        socket.to(`room_${data.roomId}`).emit("user-talking", data);
    });

    // 4. Chat Mesajları
    socket.on("chat-message", (data) => {
        io.to(`room_${data.roomId}`).emit("chat-message", data);
    });

    // 5. Bağlantı Kesilmesi
    socket.on("disconnect", () => {
        const userData = socketUsers.get(socket.id);
        if (userData) {
            const { userId, username, roomId } = userData;

            if (rooms.has(roomId)) {
                rooms.get(roomId).delete(socket.id);
                if (rooms.get(roomId).size === 0) rooms.delete(roomId);
            }

            socket.to(`room_${roomId}`).emit("user-left", { userId, username });
            socket.to(`room_${roomId}`).emit("seat-update-needed");

            socketUsers.delete(socket.id);
            userSockets.delete(userId);
            console.log(`❌ ${username} ayrıldı.`);
        }
    });

    socket.on("ping", () => { socket.emit("pong"); });
});

// Sunucu İzleme ve Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        activeConnections: socketUsers.size,
        activeRooms: rooms.size
    });
});

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>StarVoice Ses Sunucusu</title>
            <style>
                body { font-family: sans-serif; background: #1a1a2e; color: white; text-align: center; padding-top: 50px; }
                .card { background: rgba(255, 255, 255, 0.1); border-radius: 15px; padding: 30px; display: inline-block; }
                .status { color: #4ade80; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>🎙️ StarVoice Server</h1>
                <p class="status">✅ Sunucu Aktif</p>
                <p>Aktif Bağlantı: ${socketUsers.size}</p>
                <p>Aktif Oda: ${rooms.size}</p>
            </div>
        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Sunucu port ${PORT} üzerinde hazır.`);
});
      

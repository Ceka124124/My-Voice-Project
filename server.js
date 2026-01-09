const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

// Oda ve kullanıcı yönetimi
const rooms = new Map(); // roomId -> Set of socket objects
const userSockets = new Map(); // userId -> socket.id
const socketUsers = new Map(); // socket.id -> user data

console.log("🚀 Ses Sunucusu başlatılıyor...");

io.on("connection", (socket) => {
    console.log("🔌 Yeni bağlantı:", socket.id);

    // Odaya katıl
    socket.on("join-room", (data) => {
        const { roomId, userId, username, avatar } = data;

        socket.join(`room_${roomId}`);

        // Kullanıcı verilerini kaydet
        const userData = { userId, username, avatar, roomId, socketId: socket.id };
        socketUsers.set(socket.id, userData);
        userSockets.set(userId, socket.id);

        // Odayı oluştur veya güncelle
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        rooms.get(roomId).add(socket.id);

        console.log(`✅ ${username} (ID: ${userId}) odaya katıldı: room_${roomId}`);
        console.log(`📊 Oda ${roomId} - Aktif kullanıcı sayısı: ${rooms.get(roomId).size}`);

        // Diğer kullanıcılara bildir
        socket.to(`room_${roomId}`).emit("user-joined", {
            userId,
            username,
            avatar
        });

        // Mevcut kullanıcılara hoşgeldin mesajı gönder
        const roomUsers = Array.from(rooms.get(roomId))
            .map(sid => socketUsers.get(sid))
            .filter(u => u);

        socket.emit("room-users", roomUsers);
    });

    // Koltuk alındı bildirimi
    socket.on("seat-taken", (data) => {
        const { roomId, seatNumber } = data;
        socket.to(`room_${roomId}`).emit("seat-update-needed");
        console.log(`💺 Koltuk ${seatNumber} alındı - Oda: ${roomId}`);
    });

    // Koltuktan ayrıldı bildirimi
    socket.on("leave-seat", (data) => {
        const { roomId, seatNumber } = data;
        socket.to(`room_${roomId}`).emit("seat-update-needed");
        console.log(`🚪 Koltuk ${seatNumber} boşaldı - Oda: ${roomId}`);
    });

    // Konuşma durumu
    socket.on("user-talking", (data) => {
        const { roomId, seatNumber, isTalking, userId } = data;
        
        socket.to(`room_${roomId}`).emit("user-talking", {
            seatNumber,
            isTalking,
            userId
        });

        if (isTalking) {
            console.log(`🎤 Kullanıcı konuşuyor - Koltuk: ${seatNumber}, Oda: ${roomId}`);
        }
    });

    // Chat mesajı
    socket.on("chat-message", (data) => {
        const { roomId, userId, username, avatar, message } = data;

        // Tüm odaya mesajı gönder (gönderen dahil)
        io.to(`room_${roomId}`).emit("chat-message", {
            userId,
            username,
            avatar,
            message,
            timestamp: Date.now()
        });

        console.log(`💬 [Oda ${roomId}] ${username}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
    });

    // WebRTC Sinyal İletimi
    socket.on("offer", (offer) => {
        const userData = socketUsers.get(socket.id);
        if (userData) {
            socket.to(`room_${userData.roomId}`).emit("offer", {
                offer,
                from: socket.id
            });
            console.log(`📞 WebRTC Offer gönderildi - ${userData.username}`);
        }
    });

    socket.on("answer", (answer) => {
        const userData = socketUsers.get(socket.id);
        if (userData) {
            socket.to(`room_${userData.roomId}`).emit("answer", {
                answer,
                from: socket.id
            });
            console.log(`📞 WebRTC Answer gönderildi - ${userData.username}`);
        }
    });

    socket.on("ice-candidate", (candidate) => {
        const userData = socketUsers.get(socket.id);
        if (userData) {
            socket.to(`room_${userData.roomId}`).emit("ice-candidate", {
                candidate,
                from: socket.id
            });
        }
    });

    // Bağlantı koptu
    socket.on("disconnect", () => {
        const userData = socketUsers.get(socket.id);

        if (userData) {
            const { userId, username, roomId } = userData;

            // Odadan çıkar
            if (rooms.has(roomId)) {
                rooms.get(roomId).delete(socket.id);
                
                if (rooms.get(roomId).size === 0) {
                    rooms.delete(roomId);
                }
            }

            // Diğer kullanıcılara bildir
            socket.to(`room_${roomId}`).emit("user-left", {
                userId,
                username
            });

            // Koltuğun boşaldığını bildir
            socket.to(`room_${roomId}`).emit("seat-update-needed");

            // Temizlik
            socketUsers.delete(socket.id);
            userSockets.delete(userId);

            console.log(`❌ ${username} (ID: ${userId}) ayrıldı - Oda: ${roomId}`);
            console.log(`📊 Oda ${roomId} - Kalan kullanıcı: ${rooms.has(roomId) ? rooms.get(roomId).size : 0}`);
        } else {
            console.log(`❌ Bilinmeyen socket ayrıldı: ${socket.id}`);
        }
    });

    // Ping-Pong (bağlantı kontrolü)
    socket.on("ping", () => {
        socket.emit("pong");
    });
});

// Sunucu istatistikleri
setInterval(() => {
    const totalUsers = socketUsers.size;
    const totalRooms = rooms.size;
    
    console.log(`\n📊 === SUNUCU İSTATİSTİKLERİ ===`);
    console.log(`👥 Toplam Aktif Kullanıcı: ${totalUsers}`);
    console.log(`🏠 Aktif Oda Sayısı: ${totalRooms}`);
    
    if (totalRooms > 0) {
        console.log(`\n🏠 Oda Detayları:`);
        rooms.forEach((users, roomId) => {
            console.log(`   Oda ${roomId}: ${users.size} kullanıcı`);
        });
    }
    console.log(`================================\n`);
}, 60000); // Her 1 dakikada bir

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        activeConnections: socketUsers.size,
        activeRooms: rooms.size,
        timestamp: new Date().toISOString()
    });
});

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Ses Sunucusu</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    max-width: 800px;
                    margin: 50px auto;
                    padding: 20px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }
                .card {
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(10px);
                    border-radius: 15px;
                    padding: 30px;
                    margin: 20px 0;
                }
                h1 { margin: 0 0 10px 0; }
                .status { color: #4ade80; font-weight: bold; }
                .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-top: 20px; }
                .stat-box {
                    background: rgba(255, 255, 255, 0.05);
                    padding: 20px;
                    border-radius: 10px;
                    text-align: center;
                }
                .stat-number { font-size: 48px; font-weight: bold; }
                .stat-label { font-size: 14px; opacity: 0.8; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>🎙️ Ses Sunucusu</h1>
                <p class="status">✅ Sunucu Aktif ve Çalışıyor</p>
                <div class="stats">
                    <div class="stat-box">
                        <div class="stat-number" id="users">${socketUsers.size}</div>
                        <div class="stat-label">Aktif Kullanıcı</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-number" id="rooms">${rooms.size}</div>
                        <div class="stat-label">Aktif Oda</div>
                    </div>
                </div>
            </div>
            <script>
                setInterval(() => {
                    fetch('/health')
                        .then(r => r.json())
                        .then(data => {
                            document.getElementById('users').textContent = data.activeConnections;
                            document.getElementById('rooms').textContent = data.activeRooms;
                        });
                }, 5000);
            </script>
        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║  🎙️  SES SUNUCUSU BAŞARILI BİR ŞEKİLDE BAŞLATILDI   ║
║                                                       ║
║  📡 Port: ${PORT.toString().padEnd(43)} ║
║  🌐 WebSocket: Aktif                                  ║
║  🔒 CORS: Tüm originlere açık                         ║
║  ✅ Durum: Hazır                                      ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
    `);
});

const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function safePath(urlPath) {
  const clean = urlPath.split("?")[0];
  const wanted = clean === "/" ? "/index1.html" : clean;
  const resolved = path.normalize(path.join(ROOT, wanted));
  if (!resolved.startsWith(ROOT)) return null;
  return resolved;
}

const server = http.createServer((req, res) => {
  const filePath = safePath(req.url || "/");
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "text/plain; charset=utf-8" });
    res.end(data);
  });
});

const io = new Server(server, {
  cors: { origin: "*" }
});

const rooms = new Map();

function createRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function getOrCreateRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, {
      code,
      hostId: null,
      targetPlayers: 4,
      players: [] // { socketId, name }
    });
  }
  return rooms.get(code);
}

function emitLobby(room) {
  const payload = {
    roomCode: room.code,
    hostId: room.hostId,
    targetPlayers: room.targetPlayers,
    players: room.players.map((p) => ({ socketId: p.socketId, name: p.name })),
    canStart: room.players.length === room.targetPlayers
  };
  io.to(room.code).emit("lobby_update", payload);
}

function removeSocketFromRooms(socketId) {
  for (const [code, room] of rooms.entries()) {
    const before = room.players.length;
    room.players = room.players.filter((p) => p.socketId !== socketId);
    if (room.hostId === socketId) {
      room.hostId = room.players[0]?.socketId || null;
    }
    if (room.players.length === 0) {
      rooms.delete(code);
      continue;
    }
    if (room.players.length !== before) emitLobby(room);
  }
}

function buildAssignedRoles(targetPlayers) {
  const colorOrder = ["GREEN", "NEON", "YELLOW", "PINK", "RED", "BLUE", "VIOLET", "LIME", "ORANGE", "BROWN", "SILVER", "GOLD"];
  const roleByColor = {
    YELLOW: "The Oracle",
    PINK: "The Empath",
    NEON: "The Illuminator",
    GOLD: "The High Roller",
    LIME: "The Reflector",
    ORANGE: "The Merchant",
    GREEN: "The Corrupter",
    BROWN: "The Executioner",
    VIOLET: "The Soul Swapper",
    SILVER: "The Alchemist",
    RED: "The Hunter",
    BLUE: "The Siphon"
  };
  const roles = colorOrder.slice(0, targetPlayers).map((c) => roleByColor[c]);
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  return roles;
}

io.on("connection", (socket) => {
  socket.on("create_room", ({ name, targetPlayers }) => {
    const code = createRoomCode();
    const room = getOrCreateRoom(code);
    room.hostId = socket.id;
    room.targetPlayers = Math.max(4, Math.min(12, parseInt(targetPlayers, 10) || 4));
    room.players.push({ socketId: socket.id, name: (name || "Player").trim().slice(0, 20) || "Player" });
    socket.join(code);
    emitLobby(room);
  });

  socket.on("join_room", ({ name, roomCode }) => {
    const code = (roomCode || "").toUpperCase();
    if (!rooms.has(code)) {
      socket.emit("room_error", { message: "Room not found." });
      return;
    }
    const room = rooms.get(code);
    if (room.players.length >= room.targetPlayers) {
      socket.emit("room_error", { message: "Room is full." });
      return;
    }
    room.players.push({ socketId: socket.id, name: (name || "Player").trim().slice(0, 20) || "Player" });
    socket.join(code);
    emitLobby(room);
  });

  socket.on("set_target_players", ({ roomCode, targetPlayers }) => {
    const code = (roomCode || "").toUpperCase();
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;
    room.targetPlayers = Math.max(4, Math.min(12, parseInt(targetPlayers, 10) || 4));
    emitLobby(room);
  });

  socket.on("start_match", ({ roomCode }) => {
    const code = (roomCode || "").toUpperCase();
    const room = rooms.get(code);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    if (room.players.length !== room.targetPlayers) {
      socket.emit("room_error", { message: `Waiting for players (${room.players.length}/${room.targetPlayers}).` });
      return;
    }
    const assignedRoles = buildAssignedRoles(room.targetPlayers);
    const playerOrder = room.players.map((p) => p.socketId);
    io.to(code).emit("match_started", {
      roomCode: code,
      targetPlayers: room.targetPlayers,
      assignedRoles,
      playerOrder,
      playerNames: room.players.map((p) => p.name)
    });
  });

  socket.on("start_round", ({ roomCode }) => {
    const code = (roomCode || "").toUpperCase();
    const room = rooms.get(code);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    io.to(code).emit("round_started", { ts: Date.now() });
  });

  socket.on("end_discussion", ({ roomCode }) => {
    const code = (roomCode || "").toUpperCase();
    const room = rooms.get(code);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    io.to(code).emit("discussion_ended", { ts: Date.now() });
  });

  socket.on("chat_message", ({ roomCode, sender, text }) => {
    const code = (roomCode || "").toUpperCase();
    const room = rooms.get(code);
    if (!room) return;
    const raw = sender != null && String(sender).trim() !== "" ? String(sender) : "Player";
    const senderName = raw.slice(0, 20);
    const safeText = (text || "").slice(0, 300);
    if (!safeText.trim()) return;
    io.to(code).emit("chat_message", { sender: senderName, text: safeText, ts: Date.now() });
  });

  socket.on("disconnect", () => {
    removeSocketFromRooms(socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

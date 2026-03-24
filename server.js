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
      // SPA fallback: allow /ROOMCODE refresh to load index1.html.
      const INDEX = path.join(ROOT, "index1.html");
      fs.readFile(INDEX, (err2, data2) => {
        if (err2) {
          res.writeHead(404);
          res.end("Not Found");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(data2);
      });
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

function normalizePlayerKey(playerKey) {
  if (playerKey == null) return null;
  const key = String(playerKey).trim();
  if (!key) return null;
  // Keep it compact; only alphanumerics/underscore for safety.
  const clean = key.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24);
  return clean || null;
}

function createRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function getOrCreateRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, {
      code,
      hostId: null, // current host socket.id (changes on reconnect)
      hostPlayerKey: null, // stable identity
      targetPlayers: 4,
      // Seats are stable across refreshes while the playerKey is retained.
      // { playerKey, socketId|null, name, seatIndex, lastSeen }
      players: []
    });
  }
  return rooms.get(code);
}

function emitLobby(room) {
  const payload = {
    roomCode: room.code,
    hostId: room.hostId,
    targetPlayers: room.targetPlayers,
    players: room.players
      .slice()
      .sort((a, b) => a.seatIndex - b.seatIndex)
      .map((p) => ({
        socketId: p.socketId,
        playerKey: p.playerKey,
        name: p.name,
        seatIndex: p.seatIndex,
        connected: !!p.socketId
      })),
    canStart: room.players.length === room.targetPlayers
  };
  io.to(room.code).emit("lobby_update", payload);
}

function removeSocketFromRooms(socketId) {
  for (const [code, room] of rooms.entries()) {
    let changed = false;
    for (const p of room.players) {
      if (p.socketId === socketId) {
        p.socketId = null; // keep seat on refresh
        p.lastSeen = Date.now();
        changed = true;
      }
    }
    if (room.hostId === socketId) {
      room.hostId = null;
      changed = true;
    }
    if (changed) emitLobby(room);
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
  socket.on("create_room", ({ name, targetPlayers, playerKey }) => {
    const code = createRoomCode();
    const room = getOrCreateRoom(code);
    const key = normalizePlayerKey(playerKey) || socket.id.slice(-6);
    room.hostPlayerKey = key;
    room.hostId = socket.id;
    room.targetPlayers = Math.max(4, Math.min(12, parseInt(targetPlayers, 10) || 4));
    const seatIndex = 1;
    room.players.push({
      playerKey: key,
      socketId: socket.id,
      name: (name || "Player").trim().slice(0, 20) || "Player",
      seatIndex,
      lastSeen: Date.now()
    });
    socket.join(code);
    emitLobby(room);
  });

  socket.on("join_room", ({ name, roomCode, playerKey }) => {
    const code = (roomCode || "").toUpperCase();
    if (!rooms.has(code)) {
      socket.emit("room_error", { message: "Room not found." });
      return;
    }
    const room = rooms.get(code);
    const key = normalizePlayerKey(playerKey);
    if (!key) {
      socket.emit("room_error", { message: "Missing player key." });
      return;
    }

    const existing = room.players.find((p) => p.playerKey === key);
    if (existing) {
      existing.socketId = socket.id;
      existing.name = (name || existing.name).trim().slice(0, 20) || existing.name;
      existing.lastSeen = Date.now();
      if (room.hostPlayerKey === key) room.hostId = socket.id;
      socket.join(code);
      emitLobby(room);
      return;
    }

    if (room.players.length >= room.targetPlayers) {
      socket.emit("room_error", { message: "Room is full." });
      return;
    }

    const seatIndex = room.players.length + 1;
    room.players.push({
      playerKey: key,
      socketId: socket.id,
      name: (name || "Player").trim().slice(0, 20) || "Player",
      seatIndex,
      lastSeen: Date.now()
    });
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
    const ordered = room.players.slice().sort((a, b) => a.seatIndex - b.seatIndex);
    const playerOrder = ordered.map((p) => p.socketId);
    const playerKeysInSeat = ordered.map((p) => p.playerKey);
    io.to(code).emit("match_started", {
      roomCode: code,
      targetPlayers: room.targetPlayers,
      assignedRoles,
      playerOrder,
      playerNames: ordered.map((p) => p.name),
      playerKeysInSeat
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

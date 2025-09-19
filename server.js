const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Update to your Vercel URL in production
    methods: ['GET', 'POST'],
  },
});

const rooms = new Map(); // { roomId: { players: [socketIds], state: { p1: null, p2: null } } }

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Create room
  socket.on('createRoom', (callback) => {
    const roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
    rooms.set(roomId, { players: [socket.id], state: { p1: null, p2: null } });
    socket.join(roomId);
    socket.emit('roomCreated', roomId);
    if (callback) callback(roomId);
  });

  // Join room
  socket.on('joinRoom', (roomId, callback) => {
    const room = rooms.get(roomId);
    if (!room) {
      if (callback) callback({ success: false, message: 'Room not found' });
      return;
    }
    if (room.players.length >= 2) {
      if (callback) callback({ success: false, message: 'Room is full' });
      return;
    }
    room.players.push(socket.id);
    socket.join(roomId);
    socket.to(roomId).emit('playerJoined');
    if (callback) callback({ success: true, roomId });
  });

  // Character selection
  socket.on('selectCharacter', ({ roomId, playerId, characterId, side }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (playerId === room.players[0]) {
      room.state.p1 = characterId;
    } else if (playerId === room.players[1]) {
      room.state.p2 = characterId;
    }
    io.to(roomId).emit('updateSelections', room.state);
  });

  // Host starts game
  socket.on('startGame', ({ roomId, p1, p2 }) => {
    const room = rooms.get(roomId);
    if (!room || socket.id !== room.players[0]) return; // Only host
    const state = { p1, p2 };
    io.to(roomId).emit('gameStarted', state);
  });

  // Player input sync
  socket.on('playerInput', ({ roomId, playerId, input }) => {
    socket.to(roomId).emit('playerInput', { playerId, input });
  });

  // State sync
  socket.on('syncState', ({ roomId, state }) => {
    socket.to(roomId).emit('updateState', state);
  });

  // Game ended
  socket.on('gameEnded', ({ roomId, winner }) => {
    io.to(roomId).emit('gameEnded', { winner });
  });

  // Leave room (on disconnect or quit)
  socket.on('leaveRoom', (roomId) => {
    const room = rooms.get(roomId);
    if (room) {
      room.players = room.players.filter(id => id !== socket.id);
      if (room.players.length === 0) {
        rooms.delete(roomId);
      } else {
        io.to(roomId).emit('playerLeft');
      }
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    for (const [roomId, room] of rooms) {
      if (room.players.includes(socket.id)) {
        room.players = room.players.filter(id => id !== socket.id);
        if (room.players.length === 0) {
          rooms.delete(roomId);
        } else {
          io.to(roomId).emit('playerLeft');
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
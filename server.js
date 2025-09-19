const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow your Vercel app's URL
    methods: ['GET', 'POST'],
  },
});

const rooms = new Map(); // Store room data: { roomId: { players: [], state: {} } }

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Create a new room
  socket.on('createRoom', (callback) => {
    const roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
    rooms.set(roomId, { players: [socket.id], state: { p1: null, p2: null, gameStarted: false } });
    socket.join(roomId);
    socket.emit('roomCreated', roomId);
    callback(roomId);
  });

  // Join an existing room
  socket.on('joinRoom', (roomId, callback) => {
    const room = rooms.get(roomId);
    if (!room) {
      callback({ success: false, message: 'Room not found' });
      return;
    }
    if (room.players.length >= 2) {
      callback({ success: false, message: 'Room is full' });
      return;
    }
    room.players.push(socket.id);
    socket.join(roomId);
    socket.to(roomId).emit('playerJoined', socket.id);
    callback({ success: true, roomId });
  });

  // Character selection
  socket.on('selectCharacter', ({ roomId, playerId, characterId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (playerId === room.players[0]) {
      room.state.p1 = characterId;
    } else if (playerId === room.players[1]) {
      room.state.p2 = characterId;
    }
    io.to(roomId).emit('updateSelections', room.state);
    if (room.state.p1 && room.state.p2) {
      room.state.gameStarted = true;
      io.to(roomId).emit('startGame', room.state);
    }
  });

  // Player input
  socket.on('playerInput', ({ roomId, playerId, input }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    io.to(roomId).emit('playerInput', { playerId, input });
  });

  // Game state sync
  socket.on('syncState', ({ roomId, state }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.state = state;
    socket.to(roomId).emit('updateState', state);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    for (const [roomId, room] of rooms) {
      if (room.players.includes(socket.id)) {
        room.players = room.players.filter((id) => id !== socket.id);
        if (room.players.length === 0) {
          rooms.delete(roomId);
        } else {
          io.to(roomId).emit('playerLeft', socket.id);
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
const http = require('http');
const { Server } = require('socket.io');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*', credentials: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
VITE_APP_URL=process.env.VITE_APP_URL
VITE_API_URL=process.env.VITE_API_URL
VITE_AI_API_URL=process.env.VITE_AI_API_URL
VITE_MEDIA_API_URL=process.env.VITE_MEDIA_API_URL
VITE_WORKSPACE_API_URL=process.env.VITE_WORKSPACE_API_URL
FRONTEND_URL=process.env.FRONTEND_URL
io.on('connection', (socket) => {
  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId);

    // Get all socket IDs in the room except the new one
    const clients = Array.from(io.sockets.adapter.rooms.get(roomId) || []).filter(id => id !== socket.id);

    // Send the list of existing clients to the new user
    socket.emit('all-users', clients);

    // Notify others in the room
    socket.to(roomId).emit('user-joined', socket.id);

    socket.on('signal', (data) => {
      io.to(data.to).emit('signal', {
        from: socket.id,
        signal: data.signal,
      });
    });

    socket.on('disconnect', () => {
      socket.to(roomId).emit('user-left', socket.id);
    });
  });
});

server.listen(5000, () => {
  console.log('Signaling server running on port 5000');
});
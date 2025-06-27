const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mediasoup = require('mediasoup');
const cors = require('cors');
VITE_APP_URL=process.env.VITE_APP_URL
VITE_API_URL=process.env.VITE_API_URL
VITE_AI_API_URL=process.env.VITE_AI_API_URL
VITE_MEDIA_API_URL=process.env.VITE_MEDIA_API_URL
VITE_WORKSPACE_API_URL=process.env.VITE_WORKSPACE_API_URL
FRONTEND_URL=process.env.FRONTEND_URL
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: `${FRONTEND_URL}`,
    methods: ["GET", "POST"]
  }
});

app.use(cors({
  origin: `${FRONTEND_URL}`,
  credentials: true
}));
app.use(express.json());

const PORT = process.env.MEDIA_PORT || 3001;

// Enhanced logging function
function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  console.log(logMessage, Object.keys(data).length > 0 ? JSON.stringify(data, null, 2) : '');
}

// Mediasoup configuration with enhanced network settings
const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/VP9',
    clockRate: 90000,
    parameters: {
      'profile-id': 2,
      'x-google-start-bitrate': 1000,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/h264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '4d0032',
      'level-asymmetry-allowed': 1,
      'x-google-start-bitrate': 1000,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f',
      'level-asymmetry-allowed': 1,
      'x-google-start-bitrate': 1000,
    },
  },
];

// Global variables
let worker;
const rooms = new Map();
const peers = new Map();

// Initialize mediasoup worker with enhanced settings
async function createWorker() {
  log('info', '🚀 Creating mediasoup worker');
  
  worker = await mediasoup.createWorker({
    rtcMinPort: 10000,
    rtcMaxPort: 10100,
    logLevel: 'debug', // Enhanced logging
    logTags: [
      'info',
      'ice',
      'dtls',
      'rtp',
      'srtp',
      'rtcp',
      'rtx',
      'bwe',
      'score',
      'simulcast',
      'svc'
    ],
  });

  log('info', '✅ Mediasoup worker created', { 
    pid: worker.pid,
    rtcMinPort: 10000,
    rtcMaxPort: 10100
  });

  worker.on('died', (error) => {
    log('error', '💀 Mediasoup worker has died', { error: error.message, stack: error.stack });
    setTimeout(() => process.exit(1), 2000);
  });

  return worker;
}

// Enhanced Room management
class Room {
  constructor(roomId) {
    this.id = roomId;
    this.peers = new Map();
    this.router = null;
    this.createdAt = new Date();
    log('info', '🏠 Room created', { roomId });
  }

  async initialize() {
    log('info', '🔧 Initializing room router', { roomId: this.id });
    this.router = await worker.createRouter({ mediaCodecs });
    log('info', '✅ Room router initialized', { 
      roomId: this.id, 
      routerId: this.router.id,
      rtpCapabilities: {
        codecsCount: this.router.rtpCapabilities.codecs.length,
        headerExtensionsCount: this.router.rtpCapabilities.headerExtensions.length
      }
    });
  }

  addPeer(peerId, socket) {
    const peer = {
      id: peerId,
      socket: socket,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
      displayName: '',
      joined: false
    };
    
    this.peers.set(peerId, peer);
    peers.set(peerId, peer);
    log('info', '👤 Peer added to room', { 
      peerId, 
      roomId: this.id,
      totalPeers: this.peers.size
    });
    return peer;
  }

  removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (peer) {
      log('info', '👋 Removing peer from room', { peerId, roomId: this.id });
      
      // Close all transports
      peer.transports.forEach(transport => {
        log('info', '🚛 Closing transport for peer', { 
          peerId, 
          transportId: transport.id,
          direction: transport.appData?.direction || 'unknown'
        });
        transport.close();
      });
      
      // Remove peer
      this.peers.delete(peerId);
      peers.delete(peerId);
      
      log('info', '✅ Peer removed from room', { 
        peerId, 
        roomId: this.id,
        remainingPeers: this.peers.size
      });
      
      // Notify other peers
      this.broadcast('peerLeft', { peerId }, peerId);
      
      // Clean up room if empty
      if (this.peers.size === 0) {
        log('info', '🧹 Closing router for empty room', { roomId: this.id });
        this.router.close();
        rooms.delete(this.id);
        log('info', '✅ Room closed - no peers remaining', { roomId: this.id });
      }
    }
  }

  broadcast(event, data, excludePeerId = null) {
    let broadcastCount = 0;
    this.peers.forEach((peer, peerId) => {
      if (peerId !== excludePeerId && peer.socket) {
        peer.socket.emit(event, data);
        broadcastCount++;
      }
    });
    log('info', '📢 Broadcasting event', { 
      event, 
      roomId: this.id, 
      broadcastCount,
      excludePeerId,
      data: Object.keys(data)
    });
  }

  getPeersInfo() {
    const peersInfo = [];
    this.peers.forEach((peer, peerId) => {
      if (peer.joined) {
        peersInfo.push({
          id: peerId,
          displayName: peer.displayName
        });
      }
    });
    log('info', '👥 Getting peers info', { 
      roomId: this.id, 
      joinedPeers: peersInfo.length,
      totalPeers: this.peers.size
    });
    return peersInfo;
  }

  // Get all producers in the room with peer mapping
  getAllProducers() {
    const producers = [];
    this.peers.forEach((peer, peerId) => {
      peer.producers.forEach((producer, producerId) => {
        producers.push({
          peerId: peerId,
          producerId: producerId,
          kind: producer.kind
        });
      });
    });
    log('info', '🎬 Getting all producers', { 
      roomId: this.id, 
      producersCount: producers.length,
      producers: producers.map(p => ({ peerId: p.peerId, kind: p.kind }))
    });
    return producers;
  }

  // Notify all peers about a new producer
  notifyNewProducer(producerPeerId, producerId, kind) {
    log('info', '📢 Notifying peers about new producer', { 
      roomId: this.id,
      producerPeerId, 
      producerId, 
      kind,
      targetPeers: Array.from(this.peers.keys()).filter(id => id !== producerPeerId)
    });
    
    this.peers.forEach((peer, peerId) => {
      if (peerId !== producerPeerId && peer.joined && peer.socket) {
        log('info', '📤 Sending newProducer to peer', { 
          targetPeerId: peerId,
          producerPeerId,
          producerId,
          kind
        });
        peer.socket.emit('newProducer', {
          peerId: producerPeerId,
          producerId: producerId,
          kind: kind
        });
      }
    });
  }
}

// Enhanced Socket.IO connection handling
io.on('connection', (socket) => {
  log('info', '🔌 Socket connected', { 
    socketId: socket.id,
    remoteAddress: socket.handshake.address,
    userAgent: socket.handshake.headers['user-agent']
  });

  socket.on('join-room', async (data) => {
    try {
      const { roomId, displayName } = data;
      log('info', '🏠 Socket joining room', { 
        socketId: socket.id, 
        roomId, 
        displayName,
        existingRooms: rooms.size
      });

      // Get or create room
      let room = rooms.get(roomId);
      if (!room) {
        room = new Room(roomId);
        await room.initialize();
        rooms.set(roomId, room);
        log('info', '🆕 New room created and initialized', { roomId });
      } else {
        log('info', '🔄 Using existing room', { roomId, existingPeers: room.peers.size });
      }

      // Add peer to room
      const peer = room.addPeer(socket.id, socket);
      peer.displayName = displayName;
      
      socket.join(roomId);
      socket.roomId = roomId;

      // Send router RTP capabilities
      log('info', '📡 Sending router RTP capabilities', { 
        socketId: socket.id,
        codecsCount: room.router.rtpCapabilities.codecs.length
      });
      socket.emit('routerRtpCapabilities', room.router.rtpCapabilities);

    } catch (error) {
      log('error', '🔥 Error joining room', { 
        socketId: socket.id, 
        error: error.message, 
        stack: error.stack 
      });
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  socket.on('createWebRtcTransport', async (data) => {
    try {
      const { direction } = data;
      const room = rooms.get(socket.roomId);
      const peer = peers.get(socket.id);

      if (!room || !peer) {
        throw new Error('Room or peer not found');
      }

      log('info', '🚛 Creating WebRTC transport', { 
        socketId: socket.id, 
        direction,
        roomId: socket.roomId
      });

      // Enhanced transport configuration for better connectivity
      const transportOptions = {
        listenIps: [
          {
            ip: '0.0.0.0',
            announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1',
          },
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate: 1000000,
        minimumAvailableOutgoingBitrate: 600000,
        maxSctpMessageSize: 262144,
        enableSctp: true,
        numSctpStreams: { OS: 1024, MIS: 1024 },
        maxIncomingBitrate: 1500000,
        appData: { direction, peerId: socket.id }
      };

      log('info', '🔧 Transport configuration', { 
        direction,
        announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1',
        enableUdp: transportOptions.enableUdp,
        enableTcp: transportOptions.enableTcp
      });

      const transport = await room.router.createWebRtcTransport(transportOptions);

      peer.transports.set(transport.id, transport);

      transport.on('dtlsstatechange', (dtlsState) => {
        log('info', '🔐 Transport DTLS state change', { 
          transportId: transport.id, 
          dtlsState,
          direction,
          peerId: socket.id
        });
        if (dtlsState === 'closed') {
          transport.close();
          peer.transports.delete(transport.id);
        }
      });

      transport.on('icestatechange', (iceState) => {
        log('info', '🧊 Transport ICE state change', { 
          transportId: transport.id, 
          iceState,
          direction,
          peerId: socket.id
        });
      });

      transport.on('iceselectedtuplechange', (iceSelectedTuple) => {
        log('info', '🎯 Transport ICE selected tuple change', { 
          transportId: transport.id,
          iceSelectedTuple,
          direction,
          peerId: socket.id
        });
      });

      transport.on('sctpstatechange', (sctpState) => {
        log('info', '📡 Transport SCTP state change', { 
          transportId: transport.id, 
          sctpState,
          direction,
          peerId: socket.id
        });
      });

      const transportInfo = {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        direction: direction
      };

      log('info', '✅ WebRTC transport created successfully', { 
        transportId: transport.id,
        direction,
        peerId: socket.id,
        iceParametersFragment: transport.iceParameters.usernameFragment,
        iceCandidatesCount: transport.iceCandidates.length,
        dtlsRole: transport.dtlsParameters.role
      });

      socket.emit('webRtcTransportCreated', transportInfo);

    } catch (error) {
      log('error', '🔥 Error creating WebRTC transport', { 
        socketId: socket.id, 
        direction: data.direction,
        error: error.message, 
        stack: error.stack 
      });
      socket.emit('error', { message: 'Failed to create transport' });
    }
  });

  socket.on('connectTransport', async (data) => {
    try {
      const { transportId, dtlsParameters } = data;
      const peer = peers.get(socket.id);

      if (!peer) {
        throw new Error('Peer not found');
      }

      const transport = peer.transports.get(transportId);
      if (!transport) {
        throw new Error('Transport not found');
      }

      log('info', '🔗 Connecting transport', { 
        socketId: socket.id, 
        transportId,
        dtlsRole: dtlsParameters.role,
        fingerprintsCount: dtlsParameters.fingerprints?.length
      });

      await transport.connect({ dtlsParameters });
      
      log('info', '✅ Transport connected successfully', { 
        socketId: socket.id, 
        transportId,
        dtlsState: transport.dtlsState,
        iceState: transport.iceState
      });
      
      socket.emit('transportConnected', { transportId });

    } catch (error) {
      log('error', '🔥 Error connecting transport', { 
        socketId: socket.id, 
        transportId: data.transportId,
        error: error.message, 
        stack: error.stack 
      });
      socket.emit('error', { message: 'Failed to connect transport' });
    }
  });

  socket.on('produce', async (data) => {
    try {
      const { transportId, kind, rtpParameters } = data;
      const room = rooms.get(socket.roomId);
      const peer = peers.get(socket.id);

      if (!room || !peer) {
        throw new Error('Room or peer not found');
      }

      const transport = peer.transports.get(transportId);
      if (!transport) {
        throw new Error('Transport not found');
      }

      log('info', '🎬 Producing media', { 
        socketId: socket.id, 
        kind,
        transportId,
        codecsCount: rtpParameters.codecs?.length,
        encodingsCount: rtpParameters.encodings?.length
      });

      const producer = await transport.produce({ kind, rtpParameters });
      peer.producers.set(producer.id, producer);

      producer.on('transportclose', () => {
        log('info', '🛑 Producer transport closed', { 
          producerId: producer.id, 
          kind,
          peerId: socket.id
        });
        producer.close();
        peer.producers.delete(producer.id);
      });

      producer.on('score', (score) => {
        log('info', '📊 Producer score', { 
          producerId: producer.id, 
          kind,
          score,
          peerId: socket.id
        });
      });

      // Mark peer as joined when they start producing
      if (!peer.joined) {
        peer.joined = true;
        log('info', '✅ Peer marked as joined', { 
          peerId: socket.id,
          displayName: peer.displayName
        });
        
        // Notify other peers about this peer joining
        room.broadcast('peerJoined', {
          peerId: socket.id,
          displayName: peer.displayName
        }, socket.id);

        // Send existing peers to new peer
        const existingPeers = room.getPeersInfo().filter(p => p.id !== socket.id);
        if (existingPeers.length > 0) {
          socket.emit('existingPeers', existingPeers);
          log('info', '👥 Sent existing peers to new peer', { 
            newPeerId: socket.id,
            existingPeers: existingPeers.map(p => p.id)
          });
        }

        // Send existing producers to new peer
        const existingProducers = room.getAllProducers().filter(p => p.peerId !== socket.id);
        if (existingProducers.length > 0) {
          log('info', '🎬 Sending existing producers to new peer', { 
            newPeerId: socket.id,
            existingProducers: existingProducers.map(p => ({ peerId: p.peerId, kind: p.kind }))
          });
          socket.emit('existingProducers', existingProducers);
        }
      }

      // Notify other peers about new producer
      room.notifyNewProducer(socket.id, producer.id, producer.kind);

      log('info', '✅ Media produced successfully', { 
        producerId: producer.id, 
        kind,
        peerId: socket.id,
        rtpStreamParams: producer.rtpParameters?.encodings?.length
      });

      socket.emit('produced', { id: producer.id });

    } catch (error) {
      log('error', '🔥 Error producing media', { 
        socketId: socket.id, 
        kind: data.kind,
        error: error.message, 
        stack: error.stack 
      });
      socket.emit('error', { message: 'Failed to produce' });
    }
  });

  socket.on('consume', async (data) => {
    try {
      const { transportId, producerId, rtpCapabilities } = data;
      const room = rooms.get(socket.roomId);
      const peer = peers.get(socket.id);

      if (!room || !peer) {
        throw new Error('Room or peer not found');
      }

      const transport = peer.transports.get(transportId);
      if (!transport) {
        throw new Error('Transport not found');
      }

      log('info', '🍽️ Checking if can consume', { 
        socketId: socket.id, 
        producerId,
        transportId,
        codecsCount: rtpCapabilities.codecs?.length
      });

      if (!room.router.canConsume({ producerId, rtpCapabilities })) {
        log('warn', '❌ Cannot consume producer', { 
          socketId: socket.id, 
          producerId,
          reason: 'Router cannot consume with provided RTP capabilities'
        });
        socket.emit('cannotConsume', { producerId });
        return;
      }

      // Find the peer who owns this producer
      let producerPeerId = null;
      let producerKind = null;
      room.peers.forEach((p, pid) => {
        const producer = p.producers.get(producerId);
        if (producer) {
          producerPeerId = pid;
          producerKind = producer.kind;
        }
      });

      if (!producerPeerId) {
        log('error', '🔥 Producer not found in any peer', { 
          socketId: socket.id, 
          producerId 
        });
        socket.emit('cannotConsume', { producerId });
        return;
      }

      log('info', '🍽️ Creating consumer', { 
        socketId: socket.id,
        producerId, 
        producerKind, 
        producerPeerId,
        transportId
      });

      const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: true,
      });

      peer.consumers.set(consumer.id, consumer);

      consumer.on('transportclose', () => {
        log('info', '🛑 Consumer transport closed', { 
          consumerId: consumer.id, 
          producerId,
          peerId: socket.id
        });
        consumer.close();
        peer.consumers.delete(consumer.id);
      });

      consumer.on('producerclose', () => {
        log('info', '🛑 Consumer producer closed', { 
          consumerId: consumer.id, 
          producerId,
          peerId: socket.id
        });
        consumer.close();
        peer.consumers.delete(consumer.id);
        socket.emit('consumerClosed', { consumerId: consumer.id });
      });

      consumer.on('score', (score) => {
        log('info', '📊 Consumer score', { 
          consumerId: consumer.id, 
          score,
          peerId: socket.id
        });
      });

      const consumerInfo = {
        id: consumer.id,
        producerId: producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        peerId: producerPeerId
      };

      log('info', '✅ Consumer created successfully', { 
        consumerId: consumer.id,
        producerId,
        kind: consumer.kind,
        peerId: socket.id,
        producerPeerId,
        paused: consumer.paused,
        rtpParametersCount: consumer.rtpParameters?.encodings?.length
      });

      socket.emit('consumed', consumerInfo);

    } catch (error) {
      log('error', '🔥 Error consuming media', { 
        socketId: socket.id, 
        producerId: data.producerId,
        error: error.message, 
        stack: error.stack 
      });
      socket.emit('error', { message: 'Failed to consume' });
    }
  });

  socket.on('resumeConsumer', async (data) => {
    try {
      const { consumerId } = data;
      const peer = peers.get(socket.id);

      if (!peer) {
        throw new Error('Peer not found');
      }

      const consumer = peer.consumers.get(consumerId);
      if (!consumer) {
        throw new Error('Consumer not found');
      }

      log('info', '▶️ Resuming consumer', { 
        socketId: socket.id, 
        consumerId,
        kind: consumer.kind,
        paused: consumer.paused
      });

      await consumer.resume();
      
      log('info', '✅ Consumer resumed successfully', { 
        socketId: socket.id, 
        consumerId,
        kind: consumer.kind,
        paused: consumer.paused
      });
      
      socket.emit('consumerResumed', { consumerId });

    } catch (error) {
      log('error', '🔥 Error resuming consumer', { 
        socketId: socket.id, 
        consumerId: data.consumerId,
        error: error.message, 
        stack: error.stack 
      });
      socket.emit('error', { message: 'Failed to resume consumer' });
    }
  });

  socket.on('getProducers', () => {
    try {
      const room = rooms.get(socket.roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      const producers = room.getAllProducers().filter(p => p.peerId !== socket.id);
      log('info', '📋 Sending producers list', { 
        socketId: socket.id,
        producersCount: producers.length,
        producers: producers.map(p => ({ peerId: p.peerId, kind: p.kind }))
      });
      socket.emit('producers', producers);

    } catch (error) {
      log('error', '🔥 Error getting producers', { 
        socketId: socket.id, 
        error: error.message 
      });
      socket.emit('error', { message: 'Failed to get producers' });
    }
  });

  socket.on('disconnect', (reason) => {
    log('info', '🔌 Socket disconnected', { 
      socketId: socket.id, 
      reason,
      roomId: socket.roomId
    });
    
    const room = rooms.get(socket.roomId);
    if (room) {
      room.removePeer(socket.id);
    }
  });

  socket.on('error', (error) => {
    log('error', '🔥 Socket error', { 
      socketId: socket.id, 
      error: error.message,
      stack: error.stack
    });
  });
});

// Enhanced REST API endpoints
app.get('/api/media/health', (req, res) => {
  const healthInfo = {
    status: 'healthy',
    rooms: rooms.size,
    peers: peers.size,
    worker: worker ? 'running' : 'not initialized',
    timestamp: new Date().toISOString(),
    environment: {
      announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1',
      port: PORT,
      nodeVersion: process.version
    }
  };
  
  log('info', '🏥 Health check requested', healthInfo);
  res.json(healthInfo);
});

app.get('/api/media/rooms', (req, res) => {
  const roomList = [];
  rooms.forEach((room, roomId) => {
    roomList.push({
      id: roomId,
      peers: room.peers.size,
      createdAt: room.createdAt,
      producers: room.getAllProducers().length
    });
  });
  
  log('info', '🏠 Rooms list requested', { roomsCount: roomList.length });
  res.json({ rooms: roomList });
});

app.get('/api/media/debug', (req, res) => {
  const debugInfo = {
    worker: {
      pid: worker?.pid,
      died: worker?.closed
    },
    rooms: Array.from(rooms.entries()).map(([id, room]) => ({
      id,
      peers: room.peers.size,
      router: room.router?.id,
      producers: room.getAllProducers().length
    })),
    peers: Array.from(peers.entries()).map(([id, peer]) => ({
      id,
      displayName: peer.displayName,
      transports: peer.transports.size,
      producers: peer.producers.size,
      consumers: peer.consumers.size,
      joined: peer.joined
    })),
    environment: {
      MEDIASOUP_ANNOUNCED_IP: process.env.MEDIASOUP_ANNOUNCED_IP,
      NODE_ENV: process.env.NODE_ENV,
      PORT: PORT
    }
  };
  
  log('info', '🐛 Debug info requested', { 
    roomsCount: debugInfo.rooms.length,
    peersCount: debugInfo.peers.length
  });
  res.json(debugInfo);
});

// Initialize and start server
async function startServer() {
  try {
    log('info', '🚀 Starting mediasoup server', { 
      port: PORT,
      announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1',
      environment: process.env.NODE_ENV || 'development'
    });
    
    await createWorker();
    
    server.listen(PORT, () => {
      log('info', '✅ Mediasoup server started successfully', {
        port: PORT,
        healthEndpoint: `http://localhost:${PORT}/api/media/health`,
        debugEndpoint: `http://localhost:${PORT}/api/media/debug`,
        announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1'
      });
    });
  } catch (error) {
    log('error', '💀 Failed to start mediasoup server', { 
      error: error.message, 
      stack: error.stack 
    });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  log('info', '🛑 Received SIGINT, shutting down gracefully');
  if (worker) {
    worker.close();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('info', '🛑 Received SIGTERM, shutting down gracefully');
  if (worker) {
    worker.close();
  }
  process.exit(0);
});

startServer();

module.exports = { app, server };
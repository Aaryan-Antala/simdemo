import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Device } from 'mediasoup-client';
import io from 'socket.io-client';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Bot, NutOff as BotOff, FileText, Download, Users, Settings, Share2, Copy, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import GlassCard from './ui/GlassCard';
import Button from './ui/Button';

const VITE_AI_API_URL = import.meta.env.VITE_AI_API_URL;
const VITE_API_URL = import.meta.env.VITE_API_URL;
const VITE_MEDIA_API_URL = import.meta.env.VITE_MEDIA_API_URL;
const VITE_WORKSPACE_API_URL = import.meta.env.VITE_WORKSPACE_API_URL;
const VITE_APP_URL = import.meta.env.VITE_APP_URL;
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL;

interface MediasoupMeetingProps {
  roomName: string;
  displayName: string;
  onLeave: () => void;
}

interface Peer {
  id: string;
  displayName: string;
  videoElement?: HTMLVideoElement;
  audioElement?: HTMLAudioElement;
  hasVideo: boolean;
  hasAudio: boolean;
}

const MediasoupMeeting: React.FC<MediasoupMeetingProps> = ({ roomName, displayName, onLeave }) => {
  const socketRef = useRef<any>(null);
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<any>(null);
  const recvTransportRef = useRef<any>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const producersRef = useRef<Map<string, any>>(new Map());
  const consumersRef = useRef<Map<string, any>>(new Map());
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  
  const [isConnected, setIsConnected] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [peers, setPeers] = useState<Map<string, Peer>>(new Map());
  const [connectionStatus, setConnectionStatus] = useState<string>('Connecting...');
  const [error, setError] = useState<string | null>(null);

  // Calculate responsive grid layout
  const getGridLayout = useCallback((participantCount: number) => {
    if (participantCount === 1) {
      return { 
        className: 'grid-cols-1', 
        videoHeight: 'h-[80vh]',
        aspectRatio: '16/9'
      };
    } else if (participantCount === 2) {
      return { 
        className: 'grid-cols-2', 
        videoHeight: 'h-[60vh]',
        aspectRatio: '16/9'
      };
    } else if (participantCount <= 4) {
      return { 
        className: 'grid-cols-2', 
        videoHeight: 'h-[40vh]',
        aspectRatio: '16/9'
      };
    } else if (participantCount <= 6) {
      return { 
        className: 'grid-cols-3', 
        videoHeight: 'h-[35vh]',
        aspectRatio: '16/9'
      };
    } else if (participantCount <= 9) {
      return { 
        className: 'grid-cols-3', 
        videoHeight: 'h-[30vh]',
        aspectRatio: '16/9'
      };
    } else {
      return { 
        className: 'grid-cols-4', 
        videoHeight: 'h-[25vh]',
        aspectRatio: '16/9'
      };
    }
  }, []);

  const totalParticipants = peers.size + 1; // +1 for local user
  const gridLayout = getGridLayout(totalParticipants);

  // Initialize socket connection and mediasoup
  useEffect(() => {
    initializeConnection();
    
    return () => {
      cleanup();
    };
  }, [roomName, displayName]);

  const initializeConnection = async () => {
    try {
      setConnectionStatus('Connecting to server...');
      
      // Initialize socket
      socketRef.current = io(VITE_MEDIA_API_URL || 'http://localhost:3001', {
        transports: ['websocket', 'polling']
      });

      setupSocketListeners();
      
      // Join room
      socketRef.current.emit('join-room', {
        roomId: roomName,
        displayName: displayName
      });

    } catch (error) {
      console.error('Failed to initialize connection:', error);
      setError('Failed to connect to meeting server');
    }
  };

  const setupSocketListeners = () => {
    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('Connected to mediasoup server');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from mediasoup server');
      setIsConnected(false);
    });

    socket.on('routerRtpCapabilities', async (rtpCapabilities: any) => {
      try {
        setConnectionStatus('Initializing device...');
        
        deviceRef.current = new Device();
        await deviceRef.current.load({ routerRtpCapabilities });
        
        setConnectionStatus('Creating transports...');
        await createTransports();
        
      } catch (error) {
        console.error('Error handling router capabilities:', error);
        setError('Failed to initialize media device');
      }
    });

    socket.on('webRtcTransportCreated', handleTransportCreated);
    socket.on('transportConnected', handleTransportConnected);
    socket.on('produced', handleProduced);
    socket.on('consumed', handleConsumed);
    socket.on('consumerResumed', handleConsumerResumed);
    socket.on('existingPeers', handleExistingPeers);
    socket.on('existingProducers', handleExistingProducers);
    socket.on('newProducer', handleNewProducer);
    socket.on('peerJoined', handlePeerJoined);
    socket.on('peerLeft', handlePeerLeft);
    socket.on('consumerClosed', handleConsumerClosed);
    socket.on('error', handleSocketError);
  };

  const createTransports = async () => {
    // Create send transport
    socketRef.current.emit('createWebRtcTransport', { direction: 'send' });
    
    // Create receive transport
    socketRef.current.emit('createWebRtcTransport', { direction: 'recv' });
  };

  const handleTransportCreated = async (data: any) => {
    const { id, iceParameters, iceCandidates, dtlsParameters, direction } = data;
    
    try {
      if (direction === 'send') {
        sendTransportRef.current = deviceRef.current!.createSendTransport({
          id,
          iceParameters,
          iceCandidates,
          dtlsParameters,
        });

        sendTransportRef.current.on('connect', async ({ dtlsParameters }: any, callback: any, errback: any) => {
          try {
            socketRef.current.emit('connectTransport', { transportId: id, dtlsParameters });
            
            // Wait for transport connected confirmation
            const connectPromise = new Promise((resolve) => {
              const handler = (data: any) => {
                if (data.transportId === id) {
                  socketRef.current.off('transportConnected', handler);
                  resolve(data);
                }
              };
              socketRef.current.on('transportConnected', handler);
            });
            
            await connectPromise;
            callback();
          } catch (error) {
            errback(error);
          }
        });

        sendTransportRef.current.on('produce', async (parameters: any, callback: any, errback: any) => {
          try {
            socketRef.current.emit('produce', {
              transportId: id,
              kind: parameters.kind,
              rtpParameters: parameters.rtpParameters,
            });
            
            const producePromise = new Promise((resolve) => {
              socketRef.current.once('produced', resolve);
            });
            
            const data: any = await producePromise;
            callback({ id: data.id });
          } catch (error) {
            errback(error);
          }
        });

        // Start producing after send transport is ready
        if (recvTransportRef.current) {
          await startProducing();
        }

      } else if (direction === 'recv') {
        recvTransportRef.current = deviceRef.current!.createRecvTransport({
          id,
          iceParameters,
          iceCandidates,
          dtlsParameters,
        });

        recvTransportRef.current.on('connect', async ({ dtlsParameters }: any, callback: any, errback: any) => {
          try {
            socketRef.current.emit('connectTransport', { transportId: id, dtlsParameters });
            
            const connectPromise = new Promise((resolve) => {
              const handler = (data: any) => {
                if (data.transportId === id) {
                  socketRef.current.off('transportConnected', handler);
                  resolve(data);
                }
              };
              socketRef.current.on('transportConnected', handler);
            });
            
            await connectPromise;
            callback();
          } catch (error) {
            errback(error);
          }
        });

        // Start producing after both transports are ready
        if (sendTransportRef.current) {
          await startProducing();
        }
      }
    } catch (error) {
      console.error('Error creating transport:', error);
      setError('Failed to create media transport');
    }
  };

  const startProducing = async () => {
    try {
      setConnectionStatus('Getting user media...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
      });
      
      localStreamRef.current = stream;
      
      // Attach to local video element
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(console.error);
      }

      // Produce audio and video
      const audioTrack = stream.getAudioTracks()[0];
      const videoTrack = stream.getVideoTracks()[0];

      if (audioTrack && sendTransportRef.current) {
        const audioProducer = await sendTransportRef.current.produce({ track: audioTrack });
        producersRef.current.set('audio', audioProducer);
      }

      if (videoTrack && sendTransportRef.current) {
        const videoProducer = await sendTransportRef.current.produce({ track: videoTrack });
        producersRef.current.set('video', videoProducer);
      }

      setConnectionStatus('Connected');
      setIsConnected(true);

    } catch (error) {
      console.error('Error starting production:', error);
      setError('Media access denied. Please allow camera and microphone access.');
    }
  };

  const handleTransportConnected = (data: any) => {
    console.log('Transport connected:', data.transportId);
  };

  const handleProduced = (data: any) => {
    console.log('Producer created:', data.id);
  };

  const handleExistingPeers = (existingPeers: any[]) => {
    console.log('Existing peers:', existingPeers);
    const newPeers = new Map();
    existingPeers.forEach(peer => {
      newPeers.set(peer.id, {
        ...peer,
        hasVideo: false,
        hasAudio: false
      });
    });
    setPeers(newPeers);
  };

  const handleExistingProducers = (producers: any[]) => {
    console.log('Existing producers:', producers);
    producers.forEach(({ peerId, producerId, kind }) => {
      if (peerId && producerId) {
        consumeProducer(producerId, peerId);
      }
    });
  };

  const handleNewProducer = ({ peerId, producerId, kind }: any) => {
    console.log(`New producer: ${producerId} (${kind}) from peer: ${peerId}`);
    if (peerId && producerId) {
      consumeProducer(producerId, peerId);
    }
  };

  const handlePeerJoined = ({ peerId, displayName: peerDisplayName }: any) => {
    console.log(`Peer joined: ${peerId} (${peerDisplayName})`);
    setPeers(prev => {
      const newPeers = new Map(prev);
      newPeers.set(peerId, {
        id: peerId,
        displayName: peerDisplayName,
        hasVideo: false,
        hasAudio: false
      });
      return newPeers;
    });
  };

  const handlePeerLeft = ({ peerId }: any) => {
    console.log(`Peer left: ${peerId}`);
    
    // Clean up video and audio elements
    const videoElement = videoElementsRef.current.get(peerId);
    const audioElement = audioElementsRef.current.get(peerId);
    
    if (videoElement) {
      videoElement.srcObject = null;
      videoElementsRef.current.delete(peerId);
    }
    
    if (audioElement) {
      audioElement.srcObject = null;
      audioElementsRef.current.delete(peerId);
    }
    
    setPeers(prev => {
      const newPeers = new Map(prev);
      newPeers.delete(peerId);
      return newPeers;
    });
  };

  const consumeProducer = async (producerId: string, peerId: string) => {
    if (!recvTransportRef.current || !deviceRef.current) {
      console.error('Cannot consume: transport or device not ready');
      return;
    }

    try {
      socketRef.current.emit('consume', {
        transportId: recvTransportRef.current.id,
        producerId,
        rtpCapabilities: deviceRef.current.rtpCapabilities,
      });
    } catch (error) {
      console.error('Error requesting consume:', error);
    }
  };

  const handleConsumed = async (data: any) => {
    const { id, producerId, kind, rtpParameters, peerId } = data;
    
    try {
      if (!recvTransportRef.current) {
        console.error('Receive transport not ready');
        return;
      }

      const consumer = await recvTransportRef.current.consume({
        id,
        producerId,
        kind,
        rtpParameters,
      });

      consumersRef.current.set(id, consumer);

      // Create media stream
      const stream = new MediaStream([consumer.track]);

      // Update peer state and attach stream
      setPeers(prev => {
        const newPeers = new Map(prev);
        const existingPeer = newPeers.get(peerId) || {
          id: peerId,
          displayName: `User ${peerId.slice(0, 8)}`,
          hasVideo: false,
          hasAudio: false
        };

        if (kind === 'video') {
          existingPeer.hasVideo = true;
          // Attach to video element if it exists
          const videoElement = videoElementsRef.current.get(peerId);
          if (videoElement) {
            videoElement.srcObject = stream;
            videoElement.play().catch(console.error);
          }
        } else if (kind === 'audio') {
          existingPeer.hasAudio = true;
          // Attach to audio element if it exists
          const audioElement = audioElementsRef.current.get(peerId);
          if (audioElement) {
            audioElement.srcObject = stream;
            audioElement.play().catch(console.error);
          }
        }

        newPeers.set(peerId, existingPeer);
        return newPeers;
      });

      // Resume the consumer
      socketRef.current.emit('resumeConsumer', { consumerId: id });

      consumer.on('transportclose', () => {
        consumer.close();
        consumersRef.current.delete(id);
      });

    } catch (error) {
      console.error('Error consuming:', error);
    }
  };

  const handleConsumerResumed = (data: any) => {
    console.log('Consumer resumed:', data.consumerId);
  };

  const handleConsumerClosed = ({ consumerId }: any) => {
    console.log('Consumer closed:', consumerId);
    const consumer = consumersRef.current.get(consumerId);
    if (consumer) {
      consumer.close();
      consumersRef.current.delete(consumerId);
    }
  };

  const handleSocketError = (error: any) => {
    console.error('Socket error:', error);
    setError(error.message || 'Connection error occurred');
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const handleLeave = () => {
    cleanup();
    onLeave();
  };

  const cleanup = () => {
    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }

    // Close all consumers
    consumersRef.current.forEach(consumer => consumer.close());
    consumersRef.current.clear();

    // Close all producers
    producersRef.current.forEach(producer => producer.close());
    producersRef.current.clear();

    // Close transports
    if (sendTransportRef.current) {
      sendTransportRef.current.close();
    }
    if (recvTransportRef.current) {
      recvTransportRef.current.close();
    }

    // Disconnect socket
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    // Clear video elements
    videoElementsRef.current.clear();
    audioElementsRef.current.clear();
  };

  // Video element ref callback for remote peers
  const setVideoRef = useCallback((peerId: string) => (el: HTMLVideoElement | null) => {
    if (el) {
      videoElementsRef.current.set(peerId, el);
      
      // If peer already has video stream, attach it
      const peer = peers.get(peerId);
      if (peer?.hasVideo) {
        // Find the video consumer for this peer
        consumersRef.current.forEach((consumer, consumerId) => {
          if (consumer.kind === 'video') {
            const stream = new MediaStream([consumer.track]);
            el.srcObject = stream;
            el.play().catch(console.error);
          }
        });
      }
    } else {
      videoElementsRef.current.delete(peerId);
    }
  }, [peers]);

  // Audio element ref callback for remote peers
  const setAudioRef = useCallback((peerId: string) => (el: HTMLAudioElement | null) => {
    if (el) {
      audioElementsRef.current.set(peerId, el);
      
      // If peer already has audio stream, attach it
      const peer = peers.get(peerId);
      if (peer?.hasAudio) {
        // Find the audio consumer for this peer
        consumersRef.current.forEach((consumer, consumerId) => {
          if (consumer.kind === 'audio') {
            const stream = new MediaStream([consumer.track]);
            el.srcObject = stream;
            el.play().catch(console.error);
          }
        });
      }
    } else {
      audioElementsRef.current.delete(peerId);
    }
  }, [peers]);

  if (error) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="glass-panel rounded-2xl p-8 max-w-md mx-auto text-center">
          <h3 className="text-xl font-bold text-primary mb-4">Connection Error</h3>
          <p className="text-secondary mb-6">{error}</p>
          <Button onClick={handleLeave} variant="premium">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="glass-panel rounded-2xl p-8 max-w-md mx-auto text-center">
          <div className="animate-spin w-8 h-8 border-2 border-gold-text border-t-transparent rounded-full mx-auto mb-4"></div>
          <h3 className="text-xl font-bold text-primary mb-2">Connecting to Meeting...</h3>
          <p className="text-secondary">{connectionStatus}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-primary">
      {/* Meeting Header */}
      <div className="glass-panel border-b silver-border p-4 flex-shrink-0">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <h1 className="text-lg font-bold gradient-gold-silver">
              Meeting: {roomName}
            </h1>
            <div className="flex items-center space-x-2 text-sm text-secondary">
              <Users className="w-4 h-4" />
              <span>{totalParticipants} participant{totalParticipants !== 1 ? 's' : ''}</span>
            </div>
          </div>

          <Button
            onClick={handleLeave}
            variant="secondary"
            size="sm"
            className="flex items-center space-x-2 bg-red-500/20 border-red-500/50 hover:bg-red-500/30"
          >
            <PhoneOff className="w-4 h-4 text-red-400" />
            <span className="text-red-400">Leave</span>
          </Button>
        </div>
      </div>

      {/* Video Grid */}
      <div className="flex-1 p-4 overflow-hidden">
        <div 
          className={`h-full w-full grid gap-4 ${gridLayout.className} content-start`}
          style={{ maxHeight: '100%' }}
        >
          {/* Local Video */}
          <motion.div
            layout
            className={`relative glass-panel rounded-lg overflow-hidden bg-gray-900 ${gridLayout.videoHeight}`}
            style={{ aspectRatio: gridLayout.aspectRatio }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
              style={{
                display: isVideoEnabled && localStreamRef.current ? 'block' : 'none',
              }}
            />
            {(!isVideoEnabled || !localStreamRef.current) && (
              <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-gradient-gold-silver flex items-center justify-center mx-auto mb-2">
                    <span className="text-white text-xl font-bold">
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-gray-400 text-sm">
                    {!localStreamRef.current ? 'Connecting...' : 'Camera Off'}
                  </span>
                </div>
              </div>
            )}
            <div className="absolute bottom-2 left-2 glass-panel px-3 py-1 rounded-full text-sm">
              <span className="text-primary font-medium">{displayName} (You)</span>
            </div>
            <div className="absolute top-2 right-2 flex space-x-1">
              {!isAudioEnabled && (
                <div className="glass-panel p-1 rounded-full bg-red-500/20">
                  <MicOff className="w-3 h-3 text-red-400" />
                </div>
              )}
              {!isVideoEnabled && (
                <div className="glass-panel p-1 rounded-full bg-red-500/20">
                  <VideoOff className="w-3 h-3 text-red-400" />
                </div>
              )}
            </div>
          </motion.div>

          {/* Remote Videos */}
          {Array.from(peers.values()).map((peer, index) => (
            <motion.div
              key={peer.id}
              layout
              className={`relative glass-panel rounded-lg overflow-hidden bg-gray-900 ${gridLayout.videoHeight}`}
              style={{ aspectRatio: gridLayout.aspectRatio }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              {peer.hasVideo && (
                <video
                  ref={setVideoRef(peer.id)}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
              )}
              {peer.hasAudio && (
                <audio
                  ref={setAudioRef(peer.id)}
                  autoPlay
                  playsInline
                />
              )}
              {!peer.hasVideo && (
                <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-gold-silver flex items-center justify-center mx-auto mb-2">
                      <span className="text-white text-xl font-bold">
                        {peer.displayName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-gray-400 text-sm">Camera Off</span>
                  </div>
                </div>
              )}
              <div className="absolute bottom-2 left-2 glass-panel px-3 py-1 rounded-full text-sm">
                <span className="text-primary font-medium">{peer.displayName}</span>
              </div>
              <div className="absolute top-2 right-2 flex space-x-1">
                {!peer.hasAudio && (
                  <div className="glass-panel p-1 rounded-full bg-red-500/20">
                    <MicOff className="w-3 h-3 text-red-400" />
                  </div>
                )}
                {!peer.hasVideo && (
                  <div className="glass-panel p-1 rounded-full bg-red-500/20">
                    <VideoOff className="w-3 h-3 text-red-400" />
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="glass-panel border-t silver-border p-4 flex-shrink-0">
        <div className="flex justify-center items-center space-x-4">
          <button
            onClick={toggleAudio}
            className={`glass-panel p-4 rounded-full glass-panel-hover transition-all ${
              !isAudioEnabled ? 'bg-red-500/20 border-red-500/50' : ''
            }`}
          >
            {isAudioEnabled ? (
              <Mic className="w-6 h-6 text-primary" />
            ) : (
              <MicOff className="w-6 h-6 text-red-400" />
            )}
          </button>

          <button
            onClick={toggleVideo}
            className={`glass-panel p-4 rounded-full glass-panel-hover transition-all ${
              !isVideoEnabled ? 'bg-red-500/20 border-red-500/50' : ''
            }`}
          >
            {isVideoEnabled ? (
              <Video className="w-6 h-6 text-primary" />
            ) : (
              <VideoOff className="w-6 h-6 text-red-400" />
            )}
          </button>

          <button
            onClick={handleLeave}
            className="glass-panel p-4 rounded-full glass-panel-hover bg-red-500/20 border-red-500/50 hover:bg-red-500/30"
          >
            <PhoneOff className="w-6 h-6 text-red-400" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MediasoupMeeting;
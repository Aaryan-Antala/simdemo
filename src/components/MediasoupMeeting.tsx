import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Device } from 'mediasoup-client';
import io from 'socket.io-client';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Bot, NutOff as BotOff, FileText, Download, Users, Settings, Share2, Copy, Check, X, AlertTriangle } from 'lucide-react';
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

interface TranscriptEntry {
  id: string;
  speaker: string;
  text: string;
  timestamp: Date;
}

interface Note {
  id: string;
  content: string;
  timestamp: Date;
  type: 'auto' | 'manual';
}

interface Peer {
  id: string;
  displayName: string;
  videoStream?: MediaStream;
  audioStream?: MediaStream;
  hasVideo: boolean;
  hasAudio: boolean;
  videoElement?: HTMLVideoElement;
  audioElement?: HTMLAudioElement;
}

const MediasoupMeeting: React.FC<MediasoupMeetingProps> = ({ roomName, displayName, onLeave }) => {
  const socketRef = useRef<any>(null);
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<any>(null);
  const recvTransportRef = useRef<any>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<any>(null);
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  
  const [isConnected, setIsConnected] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAIEnabled, setIsAIEnabled] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [peers, setPeers] = useState<Map<string, Peer>>(new Map());
  const [showTranscript, setShowTranscript] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [meetingSummary, setMeetingSummary] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [producers, setProducers] = useState<Map<string, any>>(new Map());
  const [consumers, setConsumers] = useState<Map<string, any>>(new Map());
  const [connectionStatus, setConnectionStatus] = useState<string>('Connecting...');
  const [copied, setCopied] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [networkInfo, setNetworkInfo] = useState<any>({});

  // Enhanced logging function with categorization
  const addDebugLog = useCallback((message: string, data?: any, category: 'info' | 'warn' | 'error' | 'video' | 'audio' | 'network' = 'info') => {
    const timestamp = new Date().toISOString();
    const emoji = {
      info: '📝',
      warn: '⚠️',
      error: '🔥',
      video: '📹',
      audio: '🎵',
      network: '🌐'
    }[category];
    
    const logMessage = `[${timestamp}] ${emoji} ${message}`;
    console.log(logMessage, data || '');
    setDebugLogs(prev => [...prev.slice(-100), logMessage]); // Keep last 100 logs
  }, []);

  // Network diagnostics
  const checkNetworkInfo = useCallback(() => {
    const info = {
      userAgent: navigator.userAgent,
      onLine: navigator.onLine,
      connection: (navigator as any).connection,
      webrtcSupport: {
        getUserMedia: !!navigator.mediaDevices?.getUserMedia,
        RTCPeerConnection: !!window.RTCPeerConnection,
        RTCDataChannel: !!window.RTCDataChannel
      },
      mediaApiUrl: VITE_MEDIA_API_URL,
      timestamp: new Date().toISOString()
    };
    setNetworkInfo(info);
    addDebugLog('🌐 Network diagnostics collected', info, 'network');
    return info;
  }, [addDebugLog]);

  // Video element monitoring
  const monitorVideoElement = useCallback((element: HTMLVideoElement, peerId: string, type: 'local' | 'remote') => {
    if (!element) return;

    const logVideoState = () => {
      addDebugLog(`📹 Video element state for ${type} ${peerId}`, {
        src: element.src,
        srcObject: !!element.srcObject,
        videoWidth: element.videoWidth,
        videoHeight: element.videoHeight,
        readyState: element.readyState,
        networkState: element.networkState,
        paused: element.paused,
        muted: element.muted,
        volume: element.volume,
        currentTime: element.currentTime,
        duration: element.duration,
        buffered: element.buffered.length,
        error: element.error?.message
      }, 'video');
    };

    // Initial state
    logVideoState();

    // Monitor events
    const events = ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'playing', 'pause', 'ended', 'error', 'stalled', 'waiting'];
    
    events.forEach(eventName => {
      element.addEventListener(eventName, () => {
        addDebugLog(`📹 Video event: ${eventName} for ${type} ${peerId}`, {
          readyState: element.readyState,
          networkState: element.networkState,
          error: element.error?.message
        }, 'video');
        
        if (eventName === 'error' && element.error) {
          addDebugLog(`🔥 Video error for ${type} ${peerId}`, {
            code: element.error.code,
            message: element.error.message
          }, 'error');
        }
      });
    });

    // Monitor stream changes
    const observer = new MutationObserver(() => {
      logVideoState();
    });
    
    observer.observe(element, { attributes: true, attributeFilter: ['src'] });

    return () => {
      observer.disconnect();
    };
  }, [addDebugLog]);

  // Audio element monitoring
  const monitorAudioElement = useCallback((element: HTMLAudioElement, peerId: string) => {
    if (!element) return;

    const logAudioState = () => {
      addDebugLog(`🎵 Audio element state for ${peerId}`, {
        src: element.src,
        srcObject: !!element.srcObject,
        readyState: element.readyState,
        networkState: element.networkState,
        paused: element.paused,
        muted: element.muted,
        volume: element.volume,
        currentTime: element.currentTime,
        duration: element.duration,
        error: element.error?.message
      }, 'audio');
    };

    // Initial state
    logAudioState();

    // Monitor events
    const events = ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'playing', 'pause', 'ended', 'error'];
    
    events.forEach(eventName => {
      element.addEventListener(eventName, () => {
        addDebugLog(`🎵 Audio event: ${eventName} for ${peerId}`, {
          readyState: element.readyState,
          networkState: element.networkState
        }, 'audio');
      });
    });

    return () => {
      // Cleanup if needed
    };
  }, [addDebugLog]);

  // Calculate grid layout based on participant count
  const getGridLayout = useCallback((participantCount: number) => {
    if (participantCount === 1) {
      return { cols: 1, rows: 1, className: 'grid-cols-1' };
    } else if (participantCount === 2) {
      return { cols: 2, rows: 1, className: 'grid-cols-2' };
    } else if (participantCount <= 4) {
      return { cols: 2, rows: 2, className: 'grid-cols-2' };
    } else if (participantCount <= 6) {
      return { cols: 3, rows: 2, className: 'grid-cols-3' };
    } else if (participantCount <= 9) {
      return { cols: 3, rows: 3, className: 'grid-cols-3' };
    } else {
      return { cols: 4, rows: Math.ceil(participantCount / 4), className: 'grid-cols-4' };
    }
  }, []);

  const totalParticipants = peers.size + 1; // +1 for local user
  const gridLayout = getGridLayout(totalParticipants);

  // Initialize socket connection
  useEffect(() => {
    checkNetworkInfo();
    addDebugLog('🚀 Initializing Mediasoup meeting', { roomName, displayName, mediaApiUrl: VITE_MEDIA_API_URL });
    setConnectionStatus('Connecting to server...');
    
    socketRef.current = io(`${VITE_MEDIA_API_URL}`, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true
    });
    
    socketRef.current.on('connect', () => {
      addDebugLog('✅ Connected to mediasoup server', { socketId: socketRef.current.id });
      setConnectionStatus('Joining room...');
      joinRoom();
    });

    socketRef.current.on('disconnect', (reason: string) => {
      addDebugLog('❌ Disconnected from mediasoup server', { reason }, 'error');
      setConnectionStatus('Disconnected');
      setIsConnected(false);
    });

    socketRef.current.on('connect_error', (error: any) => {
      addDebugLog('🔥 Connection error', { error: error.message, stack: error.stack }, 'error');
      setConnectionStatus('Connection failed');
    });

    // Socket event handlers
    socketRef.current.on('routerRtpCapabilities', handleRouterRtpCapabilities);
    socketRef.current.on('webRtcTransportCreated', handleTransportCreated);
    socketRef.current.on('transportConnected', handleTransportConnected);
    socketRef.current.on('produced', handleProduced);
    socketRef.current.on('consumed', handleConsumed);
    socketRef.current.on('consumerResumed', handleConsumerResumed);
    socketRef.current.on('producers', handleProducers);
    socketRef.current.on('existingProducers', handleExistingProducers);
    socketRef.current.on('newProducer', handleNewProducer);
    socketRef.current.on('peerJoined', handlePeerJoined);
    socketRef.current.on('peerLeft', handlePeerLeft);
    socketRef.current.on('existingPeers', handleExistingPeers);
    socketRef.current.on('consumerClosed', handleConsumerClosed);
    socketRef.current.on('cannotConsume', handleCannotConsume);
    socketRef.current.on('error', handleError);

    return () => {
      addDebugLog('🧹 Cleaning up Mediasoup meeting');
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (localStream) {
        localStream.getTracks().forEach(track => {
          addDebugLog('🛑 Stopping local track', { kind: track.kind, id: track.id });
          track.stop();
        });
      }
      videoElementsRef.current.clear();
      audioElementsRef.current.clear();
    };
  }, [roomName, displayName, addDebugLog, checkNetworkInfo]);

  const joinRoom = () => {
    addDebugLog('🏠 Joining room', { roomName, displayName });
    socketRef.current.emit('join-room', {
      roomId: roomName,
      displayName: displayName
    });
  };

  const handleRouterRtpCapabilities = async (rtpCapabilities: any) => {
    try {
      addDebugLog('📡 Received router RTP capabilities', { 
        codecsCount: rtpCapabilities.codecs?.length,
        headerExtensionsCount: rtpCapabilities.headerExtensions?.length 
      });
      setConnectionStatus('Initializing device...');
      
      deviceRef.current = new Device();
      await deviceRef.current.load({ routerRtpCapabilities: rtpCapabilities });
      addDebugLog('✅ Device loaded successfully', { 
        canProduce: {
          audio: deviceRef.current.canProduce('audio'),
          video: deviceRef.current.canProduce('video')
        },
        rtpCapabilities: deviceRef.current.rtpCapabilities
      });
      
      setConnectionStatus('Creating transports...');
      await createTransports();
      
    } catch (error: any) {
      addDebugLog('🔥 Error handling router RTP capabilities', { error: error.message, stack: error.stack }, 'error');
      setConnectionStatus('Failed to initialize device');
    }
  };

  const createTransports = async () => {
    addDebugLog('🚛 Creating WebRTC transports');
    
    // Create send transport
    addDebugLog('📤 Requesting send transport creation');
    socketRef.current.emit('createWebRtcTransport', { direction: 'send' });
    
    // Create receive transport
    addDebugLog('📥 Requesting receive transport creation');
    socketRef.current.emit('createWebRtcTransport', { direction: 'recv' });
  };

  const handleTransportCreated = async (data: any) => {
    const { id, iceParameters, iceCandidates, dtlsParameters, direction } = data;
    addDebugLog(`🚛 Transport created: ${direction}`, { 
      id, 
      iceParametersCount: iceParameters?.usernameFragment ? 1 : 0,
      iceCandidatesCount: iceCandidates?.length,
      dtlsRole: dtlsParameters?.role,
      dtlsFingerprints: dtlsParameters?.fingerprints?.length,
      iceCandidates: iceCandidates?.map((c: any) => ({ 
        ip: c.ip, 
        port: c.port, 
        protocol: c.protocol, 
        type: c.type 
      }))
    }, 'network');
    
    try {
      if (direction === 'send' && !sendTransportRef.current) {
        addDebugLog('📤 Creating send transport on client');
        sendTransportRef.current = deviceRef.current!.createSendTransport({
          id,
          iceParameters,
          iceCandidates,
          dtlsParameters,
        });

        sendTransportRef.current.on('connect', async ({ dtlsParameters }: any, callback: any, errback: any) => {
          try {
            addDebugLog('🔗 Send transport connecting', { transportId: id, dtlsRole: dtlsParameters.role }, 'network');
            socketRef.current.emit('connectTransport', {
              transportId: id,
              dtlsParameters,
            });
            
            const connectPromise = new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Transport connect timeout'));
              }, 15000);
              
              const handler = (data: any) => {
                if (data.transportId === id) {
                  clearTimeout(timeout);
                  socketRef.current.off('transportConnected', handler);
                  resolve(data);
                }
              };
              socketRef.current.on('transportConnected', handler);
            });
            
            await connectPromise;
            addDebugLog('✅ Send transport connected successfully');
            callback();
          } catch (error: any) {
            addDebugLog('🔥 Send transport connect error', { error: error.message }, 'error');
            errback(error);
          }
        });

        sendTransportRef.current.on('produce', async (parameters: any, callback: any, errback: any) => {
          try {
            addDebugLog('🎬 Producing media', { 
              kind: parameters.kind,
              codecOptions: parameters.codecOptions,
              rtpParameters: {
                codecs: parameters.rtpParameters.codecs?.length,
                encodings: parameters.rtpParameters.encodings?.length
              }
            });
            
            socketRef.current.emit('produce', {
              transportId: id,
              kind: parameters.kind,
              rtpParameters: parameters.rtpParameters,
            });
            
            const producePromise = new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Produce timeout'));
              }, 15000);
              
              const handler = (data: any) => {
                clearTimeout(timeout);
                socketRef.current.off('produced', handler);
                resolve(data);
              };
              socketRef.current.on('produced', handler);
            });
            
            const result: any = await producePromise;
            addDebugLog('✅ Media produced successfully', { producerId: result.id, kind: parameters.kind });
            callback({ id: result.id });
          } catch (error: any) {
            addDebugLog('🔥 Produce error', { error: error.message, kind: parameters.kind }, 'error');
            errback(error);
          }
        });

        sendTransportRef.current.on('connectionstatechange', (state: string) => {
          addDebugLog(`📤 Send transport connection state: ${state}`, {}, 'network');
          if (state === 'failed') {
            addDebugLog('🔥 CRITICAL: Send transport failed', {}, 'error');
            checkNetworkInfo();
          }
        });

        sendTransportRef.current.on('icestatechange', (state: string) => {
          addDebugLog(`📤 Send transport ICE state: ${state}`, {}, 'network');
        });

        if (recvTransportRef.current) {
          await startProducing();
        }

      } else if (direction === 'recv' && !recvTransportRef.current) {
        addDebugLog('📥 Creating receive transport on client');
        recvTransportRef.current = deviceRef.current!.createRecvTransport({
          id,
          iceParameters,
          iceCandidates,
          dtlsParameters,
        });

        recvTransportRef.current.on('connect', async ({ dtlsParameters }: any, callback: any, errback: any) => {
          try {
            addDebugLog('🔗 Receive transport connecting', { transportId: id, dtlsRole: dtlsParameters.role }, 'network');
            socketRef.current.emit('connectTransport', {
              transportId: id,
              dtlsParameters,
            });
            
            const connectPromise = new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Transport connect timeout'));
              }, 15000);
              
              const handler = (data: any) => {
                if (data.transportId === id) {
                  clearTimeout(timeout);
                  socketRef.current.off('transportConnected', handler);
                  resolve(data);
                }
              };
              socketRef.current.on('transportConnected', handler);
            });
            
            await connectPromise;
            addDebugLog('✅ Receive transport connected successfully');
            callback();
          } catch (error: any) {
            addDebugLog('🔥 Receive transport connect error', { error: error.message }, 'error');
            errback(error);
          }
        });

        recvTransportRef.current.on('connectionstatechange', (state: string) => {
          addDebugLog(`📥 Receive transport connection state: ${state}`, {}, 'network');
          if (state === 'failed') {
            addDebugLog('🔥 CRITICAL: Receive transport failed - this is why you can\'t see/hear peers!', {
              networkInfo,
              iceCandidates: iceCandidates?.map((c: any) => ({ ip: c.ip, port: c.port, protocol: c.protocol }))
            }, 'error');
            checkNetworkInfo();
          }
        });

        recvTransportRef.current.on('icestatechange', (state: string) => {
          addDebugLog(`📥 Receive transport ICE state: ${state}`, {}, 'network');
        });

        recvTransportRef.current.on('iceselectedtuplechange', (iceSelectedTuple: any) => {
          addDebugLog('📥 Receive transport ICE selected tuple changed', { iceSelectedTuple }, 'network');
        });

        if (sendTransportRef.current) {
          await startProducing();
        }
      }
    } catch (error: any) {
      addDebugLog('🔥 Error creating transport', { error: error.message, direction, stack: error.stack }, 'error');
      setConnectionStatus('Failed to create transport');
    }
  };

  const startProducing = async () => {
    try {
      setConnectionStatus('Getting user media...');
      addDebugLog('🎥 Getting user media');
      
      const constraints = {
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        },
      };
      
      addDebugLog('🎥 Requesting media with constraints', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      addDebugLog('✅ Got user media stream', { 
        streamId: stream.id,
        tracks: stream.getTracks().map(track => ({
          kind: track.kind,
          id: track.id,
          enabled: track.enabled,
          readyState: track.readyState,
          settings: track.getSettings()
        }))
      });
      
      setLocalStream(stream);

      const audioTrack = stream.getAudioTracks()[0];
      const videoTrack = stream.getVideoTracks()[0];

      if (audioTrack && sendTransportRef.current) {
        addDebugLog('🎵 Producing audio track', { 
          trackId: audioTrack.id,
          settings: audioTrack.getSettings(),
          constraints: audioTrack.getConstraints()
        }, 'audio');
        const audioProducer = await sendTransportRef.current.produce({ track: audioTrack });
        setProducers(prev => new Map(prev.set('audio', audioProducer)));
        
        audioProducer.on('trackended', () => {
          addDebugLog('🛑 Audio track ended', {}, 'audio');
        });

        audioProducer.on('transportclose', () => {
          addDebugLog('🛑 Audio producer transport closed', {}, 'audio');
        });
      }

      if (videoTrack && sendTransportRef.current) {
        addDebugLog('📹 Producing video track', { 
          trackId: videoTrack.id,
          settings: videoTrack.getSettings(),
          constraints: videoTrack.getConstraints()
        }, 'video');
        const videoProducer = await sendTransportRef.current.produce({ track: videoTrack });
        setProducers(prev => new Map(prev.set('video', videoProducer)));
        
        videoProducer.on('trackended', () => {
          addDebugLog('🛑 Video track ended', {}, 'video');
        });

        videoProducer.on('transportclose', () => {
          addDebugLog('🛑 Video producer transport closed', {}, 'video');
        });
      }

      setConnectionStatus('Connected');
      setIsConnected(true);
      addDebugLog('🎉 Successfully connected and producing media');

    } catch (error: any) {
      addDebugLog('🔥 Error starting production', { error: error.message, stack: error.stack }, 'error');
      setConnectionStatus('Media access denied');
    }
  };

  // Effect to handle local video stream attachment
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      addDebugLog('📺 Attaching local stream to video element', { 
        streamId: localStream.id,
        videoElement: !!localVideoRef.current
      }, 'video');
      const videoElement = localVideoRef.current;
      
      videoElement.srcObject = localStream;
      videoElement.muted = true;
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      
      // Monitor local video element
      monitorVideoElement(videoElement, 'local', 'local');
      
      const playPromise = videoElement.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            addDebugLog('✅ Local video playing successfully', {
              videoWidth: videoElement.videoWidth,
              videoHeight: videoElement.videoHeight,
              duration: videoElement.duration
            }, 'video');
          })
          .catch(error => {
            addDebugLog('🔥 Local video play failed', { error: error.message }, 'error');
          });
      }
    }
  }, [localStream, addDebugLog, monitorVideoElement]);

  const handleTransportConnected = (data: any) => {
    addDebugLog('✅ Transport connected confirmation', data);
  };

  const handleProduced = (data: any) => {
    addDebugLog('✅ Producer created confirmation', data);
  };

  const handleConsumed = async (data: any) => {
    const { id, producerId, kind, rtpParameters, peerId } = data;
    addDebugLog(`🍽️ Consuming media`, { 
      consumerId: id, 
      producerId, 
      kind, 
      peerId,
      rtpParameters: {
        codecs: rtpParameters.codecs?.length,
        encodings: rtpParameters.encodings?.length
      }
    });

    try {
      if (!recvTransportRef.current) {
        addDebugLog('🔥 Receive transport not ready for consuming', {}, 'error');
        return;
      }

      const consumer = await recvTransportRef.current.consume({
        id,
        producerId,
        kind,
        rtpParameters,
      });

      addDebugLog(`✅ Consumer created successfully`, { 
        consumerId: consumer.id, 
        peerId,
        track: {
          id: consumer.track.id,
          kind: consumer.track.kind,
          enabled: consumer.track.enabled,
          readyState: consumer.track.readyState,
          settings: consumer.track.getSettings()
        }
      });
      
      setConsumers(prev => new Map(prev.set(id, consumer)));

      // Resume the consumer immediately
      addDebugLog(`▶️ Resuming consumer`, { consumerId: id });
      socketRef.current.emit('resumeConsumer', { consumerId: id });

      // Create stream and update peer state
      const stream = new MediaStream([consumer.track]);
      addDebugLog(`🌊 Created stream for peer`, { 
        peerId, 
        streamId: stream.id,
        kind,
        trackCount: stream.getTracks().length,
        trackDetails: stream.getTracks().map(track => ({
          id: track.id,
          kind: track.kind,
          enabled: track.enabled,
          readyState: track.readyState
        }))
      });
      
      // Update peer with stream info
      setPeers(prev => {
        const newPeers = new Map(prev);
        const existingPeer = newPeers.get(peerId);
        
        const peer: Peer = {
          id: peerId,
          displayName: existingPeer?.displayName || `User ${peerId.slice(0, 8)}`,
          hasVideo: existingPeer?.hasVideo || false,
          hasAudio: existingPeer?.hasAudio || false,
          videoStream: existingPeer?.videoStream,
          audioStream: existingPeer?.audioStream,
          videoElement: existingPeer?.videoElement,
          audioElement: existingPeer?.audioElement
        };

        if (kind === 'video') {
          peer.videoStream = stream;
          peer.hasVideo = true;
          addDebugLog(`📹 Updated peer with video stream`, { 
            peerId, 
            streamId: stream.id,
            hasVideoElement: !!peer.videoElement
          }, 'video');
        } else if (kind === 'audio') {
          peer.audioStream = stream;
          peer.hasAudio = true;
          addDebugLog(`🎵 Updated peer with audio stream`, { 
            peerId, 
            streamId: stream.id,
            hasAudioElement: !!peer.audioElement
          }, 'audio');
        }

        newPeers.set(peerId, peer);
        return newPeers;
      });

      consumer.on('transportclose', () => {
        addDebugLog('🛑 Consumer transport closed', { consumerId: consumer.id, peerId });
        consumer.close();
        setConsumers(prev => {
          const map = new Map(prev);
          map.delete(id);
          return map;
        });
      });

      consumer.on('producerclose', () => {
        addDebugLog('🛑 Consumer producer closed', { consumerId: consumer.id, peerId });
        consumer.close();
        setConsumers(prev => {
          const map = new Map(prev);
          map.delete(id);
          return map;
        });
      });

    } catch (error: any) {
      addDebugLog('🔥 Error consuming media', { error: error.message, consumerId: id, peerId, stack: error.stack }, 'error');
    }
  };

  const handleProducers = (producers: any[]) => {
    addDebugLog('📋 Received existing producers list', { count: producers.length, producers });
    if (!producers || producers.length === 0) return;
    
    producers.forEach(({ peerId, producerId, kind }) => {
      if (peerId && producerId) {
        addDebugLog(`🔄 Consuming existing producer`, { producerId, kind, peerId });
        consume(producerId, peerId);
      }
    });
  };

  const handleExistingProducers = (producers: any[]) => {
    addDebugLog('📋 Received existing producers on join', { count: producers.length });
    handleProducers(producers);
  };

  const handleNewProducer = ({ peerId, producerId, kind }: any) => {
    addDebugLog(`🆕 New producer available`, { peerId, producerId, kind });
    if (!peerId || !producerId) return;
    consume(producerId, peerId);
  };

  const handleConsumerResumed = (data: any) => {
    addDebugLog('▶️ Consumer resumed successfully', data);
  };

  const consume = (producerId: string, peerId: string) => {
    if (!recvTransportRef.current || !deviceRef.current) {
      addDebugLog('🔥 Cannot consume: transport or device not ready', { 
        hasRecvTransport: !!recvTransportRef.current,
        hasDevice: !!deviceRef.current,
        recvTransportState: recvTransportRef.current?.connectionState
      }, 'error');
      return;
    }

    addDebugLog(`🍽️ Requesting to consume producer`, { producerId, peerId });
    socketRef.current.emit('consume', {
      transportId: recvTransportRef.current.id,
      producerId,
      rtpCapabilities: deviceRef.current.rtpCapabilities,
    });
  };

  const handlePeerJoined = ({ peerId, displayName: peerDisplayName }: any) => {
    addDebugLog(`👋 Peer joined`, { peerId, displayName: peerDisplayName });
    setPeers(prev => {
      const newPeers = new Map(prev);
      const existingPeer = newPeers.get(peerId);
      
      newPeers.set(peerId, {
        id: peerId,
        displayName: peerDisplayName,
        hasVideo: existingPeer?.hasVideo || false,
        hasAudio: existingPeer?.hasAudio || false,
        videoStream: existingPeer?.videoStream,
        audioStream: existingPeer?.audioStream,
        videoElement: existingPeer?.videoElement,
        audioElement: existingPeer?.audioElement
      });
      
      return newPeers;
    });
  };

  const handlePeerLeft = ({ peerId }: any) => {
    addDebugLog(`👋 Peer left`, { peerId });
    
    // Clean up video and audio elements for this peer
    const videoElement = videoElementsRef.current.get(peerId);
    if (videoElement) {
      addDebugLog(`🧹 Cleaning up video element for peer`, { peerId }, 'video');
      videoElement.srcObject = null;
      videoElementsRef.current.delete(peerId);
    }
    
    const audioElement = audioElementsRef.current.get(peerId);
    if (audioElement) {
      addDebugLog(`🧹 Cleaning up audio element for peer`, { peerId }, 'audio');
      audioElement.srcObject = null;
      audioElementsRef.current.delete(peerId);
    }
    
    setPeers(prev => {
      const newPeers = new Map(prev);
      newPeers.delete(peerId);
      return newPeers;
    });
  };

  const handleExistingPeers = (existingPeers: any[]) => {
    addDebugLog('👥 Received existing peers list', { count: existingPeers.length, peers: existingPeers });
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

  const handleConsumerClosed = ({ consumerId }: any) => {
    addDebugLog('🛑 Consumer closed by server', { consumerId });
    setConsumers(prev => {
      const newConsumers = new Map(prev);
      newConsumers.delete(consumerId);
      return newConsumers;
    });
  };

  const handleCannotConsume = ({ producerId }: any) => {
    addDebugLog('❌ Cannot consume producer', { producerId }, 'warn');
  };

  const handleError = (error: any) => {
    addDebugLog('🔥 Socket error received', { error: error.message || error, stack: error.stack }, 'error');
    setConnectionStatus(`Error: ${error.message || 'Unknown error'}`);
  };

  // Enhanced video element ref callback for remote peers
  const setVideoRef = useCallback((peer: Peer) => (el: HTMLVideoElement | null) => {
    if (el) {
      addDebugLog(`📺 Video element created for peer`, { peerId: peer.id }, 'video');
      videoElementsRef.current.set(peer.id, el);
      
      // Update peer with element reference
      setPeers(prev => {
        const newPeers = new Map(prev);
        const existingPeer = newPeers.get(peer.id);
        if (existingPeer) {
          existingPeer.videoElement = el;
          newPeers.set(peer.id, existingPeer);
        }
        return newPeers;
      });

      // Monitor this video element
      monitorVideoElement(el, peer.id, 'remote');

      if (peer.videoStream) {
        addDebugLog(`📺 Attaching video stream to element`, { 
          peerId: peer.id, 
          streamId: peer.videoStream.id,
          elementReady: !!el
        }, 'video');
        
        el.srcObject = peer.videoStream;
        el.autoplay = true;
        el.playsInline = true;
        
        const playPromise = el.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              addDebugLog(`✅ Video playing for peer`, { 
                peerId: peer.id,
                videoWidth: el.videoWidth,
                videoHeight: el.videoHeight,
                duration: el.duration,
                currentTime: el.currentTime
              }, 'video');
            })
            .catch(error => {
              addDebugLog(`🔥 Error playing video for peer`, { 
                peerId: peer.id, 
                error: error.message,
                elementState: {
                  readyState: el.readyState,
                  networkState: el.networkState,
                  paused: el.paused
                }
              }, 'error');
            });
        }
      } else {
        addDebugLog(`⚠️ No video stream available for peer`, { peerId: peer.id }, 'warn');
      }
    } else {
      addDebugLog(`❌ Video element is null for peer`, { peerId: peer.id }, 'error');
    }
  }, [addDebugLog, monitorVideoElement]);

  // Enhanced audio element ref callback for remote peers
  const setAudioRef = useCallback((peer: Peer) => (el: HTMLAudioElement | null) => {
    if (el) {
      addDebugLog(`🎵 Audio element created for peer`, { peerId: peer.id }, 'audio');
      audioElementsRef.current.set(peer.id, el);
      
      // Update peer with element reference
      setPeers(prev => {
        const newPeers = new Map(prev);
        const existingPeer = newPeers.get(peer.id);
        if (existingPeer) {
          existingPeer.audioElement = el;
          newPeers.set(peer.id, existingPeer);
        }
        return newPeers;
      });

      // Monitor this audio element
      monitorAudioElement(el, peer.id);

      if (peer.audioStream) {
        addDebugLog(`🎵 Attaching audio stream to element`, { 
          peerId: peer.id, 
          streamId: peer.audioStream.id,
          elementReady: !!el
        }, 'audio');
        
        el.srcObject = peer.audioStream;
        el.autoplay = true;
        el.playsInline = true;
        
        const playPromise = el.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              addDebugLog(`✅ Audio playing for peer`, { 
                peerId: peer.id,
                duration: el.duration,
                volume: el.volume
              }, 'audio');
            })
            .catch(error => {
              addDebugLog(`🔥 Error playing audio for peer`, { 
                peerId: peer.id, 
                error: error.message,
                elementState: {
                  readyState: el.readyState,
                  networkState: el.networkState,
                  paused: el.paused
                }
              }, 'error');
            });
        }
      } else {
        addDebugLog(`⚠️ No audio stream available for peer`, { peerId: peer.id }, 'warn');
      }
    } else {
      addDebugLog(`❌ Audio element is null for peer`, { peerId: peer.id }, 'error');
    }
  }, [addDebugLog, monitorAudioElement]);

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
        addDebugLog(`🎵 Audio ${audioTrack.enabled ? 'enabled' : 'disabled'}`, {}, 'audio');
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
        addDebugLog(`📹 Video ${videoTrack.enabled ? 'enabled' : 'disabled'}`, {}, 'video');
      }
    }
  };

  const handleLeave = () => {
    addDebugLog('👋 Leaving meeting');
    if (localStream) {
      localStream.getTracks().forEach(track => {
        addDebugLog('🛑 Stopping local track', { kind: track.kind, id: track.id });
        track.stop();
      });
    }
    onLeave();
  };

  // Debug panel with categorized logs
  const renderDebugPanel = () => {
    const categories = ['error', 'network', 'video', 'audio', 'info'];
    const filteredLogs = debugLogs.filter(log => {
      // Show all logs by default, could add filtering here
      return true;
    });

    return (
      <motion.div
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: 500, opacity: 1 }}
        exit={{ width: 0, opacity: 0 }}
        className="glass-panel border-l silver-border flex flex-col z-30 max-w-[500px]"
      >
        <div className="p-4 border-b silver-border">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-primary">Debug Panel</h3>
            <div className="flex space-x-2">
              <Button
                onClick={() => setDebugLogs([])}
                variant="ghost"
                size="sm"
              >
                Clear
              </Button>
              <Button
                onClick={() => setShowDebugPanel(false)}
                variant="ghost"
                size="sm"
              >
                ×
              </Button>
            </div>
          </div>
          
          {/* Critical Status */}
          <div className="space-y-2 text-xs">
            <div className="flex items-center space-x-2">
              <span className="font-medium">Send Transport:</span>
              <span className={sendTransportRef.current?.connectionState === 'connected' ? 'text-green-500' : 'text-red-500'}>
                {sendTransportRef.current?.connectionState || 'Not created'}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="font-medium">Recv Transport:</span>
              <span className={recvTransportRef.current?.connectionState === 'connected' ? 'text-green-500' : 'text-red-500'}>
                {recvTransportRef.current?.connectionState || 'Not created'}
              </span>
              {recvTransportRef.current?.connectionState === 'failed' && (
                <AlertTriangle className="w-4 h-4 text-red-500" />
              )}
            </div>
            <div className="flex items-center space-x-2">
              <span className="font-medium">Peers:</span>
              <span className="text-primary">{peers.size}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="font-medium">Consumers:</span>
              <span className="text-primary">{consumers.size}</span>
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-1">
            {filteredLogs.slice(-50).map((log, index) => {
              const isError = log.includes('🔥');
              const isWarning = log.includes('⚠️');
              const isVideo = log.includes('📹') || log.includes('📺');
              const isAudio = log.includes('🎵');
              const isNetwork = log.includes('🌐') || log.includes('📡') || log.includes('🚛');
              
              return (
                <div 
                  key={index} 
                  className={`text-xs font-mono break-all p-1 rounded ${
                    isError ? 'bg-red-500/10 text-red-400' :
                    isWarning ? 'bg-yellow-500/10 text-yellow-400' :
                    isVideo ? 'bg-purple-500/10 text-purple-400' :
                    isAudio ? 'bg-blue-500/10 text-blue-400' :
                    isNetwork ? 'bg-green-500/10 text-green-400' :
                    'text-secondary'
                  }`}
                >
                  {log}
                </div>
              );
            })}
          </div>
          
          {debugLogs.length === 0 && (
            <div className="text-center text-secondary py-8">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Debug logs will appear here</p>
            </div>
          )}
        </div>
      </motion.div>
    );
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-primary flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="glass-panel rounded-2xl p-8 max-w-2xl mx-auto">
            <div className="text-center mb-6">
              <div className="animate-spin w-8 h-8 border-2 border-gold-text border-t-transparent rounded-full mx-auto mb-4"></div>
              <h3 className="text-xl font-bold text-primary mb-2">Connecting to Meeting...</h3>
              <p className="text-secondary mb-4">{connectionStatus}</p>
              <div className="text-sm text-secondary">
                <p>Room: <span className="font-medium text-primary">{roomName}</span></p>
                <p>Name: <span className="font-medium text-primary">{displayName}</span></p>
                <p>Server: <span className="font-medium text-primary">{VITE_MEDIA_API_URL}</span></p>
              </div>
            </div>
            
            {/* Debug Logs */}
            <div className="mt-6">
              <h4 className="text-sm font-bold text-primary mb-2">Debug Logs (Last 10):</h4>
              <div className="bg-black/20 rounded-lg p-3 max-h-40 overflow-y-auto">
                {debugLogs.slice(-10).map((log, index) => (
                  <div key={index} className="text-xs text-secondary font-mono mb-1">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-primary">
      {/* Meeting Header - Fixed at top */}
      <div className="glass-panel border-b silver-border p-4 flex-shrink-0 z-50">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <h1 className="text-lg font-bold gradient-gold-silver">
              Meeting: {roomName}
            </h1>
            <div className="flex items-center space-x-2 text-sm text-secondary">
              <Users className="w-4 h-4" />
              <span>{totalParticipants} participant{totalParticipants !== 1 ? 's' : ''}</span>
            </div>
            
            {/* Transport Status Indicators */}
            <div className="flex items-center space-x-2 text-xs">
              <div className={`w-2 h-2 rounded-full ${
                sendTransportRef.current?.connectionState === 'connected' ? 'bg-green-500' : 'bg-red-500'
              }`} title={`Send: ${sendTransportRef.current?.connectionState || 'Not ready'}`} />
              <div className={`w-2 h-2 rounded-full ${
                recvTransportRef.current?.connectionState === 'connected' ? 'bg-green-500' : 'bg-red-500'
              }`} title={`Receive: ${recvTransportRef.current?.connectionState || 'Not ready'}`} />
              {recvTransportRef.current?.connectionState === 'failed' && (
                <AlertTriangle className="w-4 h-4 text-red-500" title="Receive transport failed - this is why you can't see/hear peers!" />
              )}
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Debug Toggle */}
            <Button
              onClick={() => setShowDebugPanel(!showDebugPanel)}
              variant={showDebugPanel ? "premium" : "secondary"}
              size="sm"
              className="flex items-center space-x-2"
            >
              <FileText className="w-4 h-4" />
              <span>Debug ({debugLogs.length})</span>
            </Button>

            <Button
              onClick={() => setShowInviteModal(true)}
              variant="secondary"
              size="sm"
              className="flex items-center space-x-2"
            >
              <Share2 className="w-4 h-4" />
              <span>Invite Others</span>
            </Button>

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
      </div>

      {/* Main Meeting Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Grid */}
        <div className="flex-1 p-4">
          <div 
            className={`h-full w-full grid gap-4 ${gridLayout.className}`}
            style={{
              gridAutoRows: totalParticipants === 1 ? '1fr' : 'minmax(200px, 1fr)'
            }}
          >
            {/* Local Video */}
            <motion.div
              layout
              className="relative glass-panel rounded-lg overflow-hidden bg-gray-900"
              style={{ aspectRatio: '16/9' }}
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
                  display: isVideoEnabled && localStream ? 'block' : 'none',
                }}
              />
              {(!isVideoEnabled || !localStream) && (
                <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-gold-silver flex items-center justify-center mx-auto mb-2">
                      <span className="text-white text-xl font-bold">
                        {displayName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-gray-400 text-sm">
                      {!localStream ? 'Connecting...' : 'Camera Off'}
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
                className="relative glass-panel rounded-lg overflow-hidden bg-gray-900"
                style={{ aspectRatio: '16/9' }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
              >
                {peer.hasVideo && peer.videoStream && (
                  <video
                    ref={setVideoRef(peer)}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                )}
                {peer.hasAudio && peer.audioStream && (
                  <audio
                    ref={setAudioRef(peer)}
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
                
                {/* Debug info overlay for each peer */}
                <div className="absolute top-2 left-2 text-xs text-white bg-black/50 rounded px-2 py-1">
                  V:{peer.hasVideo ? '✓' : '✗'} A:{peer.hasAudio ? '✓' : '✗'}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Debug Panel */}
        <AnimatePresence>
          {showDebugPanel && renderDebugPanel()}
        </AnimatePresence>
      </div>

      {/* Controls - Fixed at bottom */}
      <div className="glass-panel border-t silver-border p-4 flex-shrink-0 z-50">
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

      {/* Invite Others Modal */}
      <AnimatePresence>
        {showInviteModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md"
            >
              <GlassCard className="p-8" goldBorder>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold gradient-gold-silver">Invite Others</h2>
                  <button
                    onClick={() => setShowInviteModal(false)}
                    className="text-secondary hover:text-primary"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-primary mb-2">
                      Room Name
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={roomName}
                        readOnly
                        className="flex-1 glass-panel rounded-lg px-4 py-3 text-primary bg-gray-500/10"
                      />
                      <Button
                        onClick={() => navigator.clipboard.writeText(roomName)}
                        variant="ghost"
                        size="sm"
                        className="px-3"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-primary mb-2">
                      Meeting Link
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={`${window.location.origin}/meetings?room=${encodeURIComponent(roomName)}`}
                        readOnly
                        className="flex-1 glass-panel rounded-lg px-4 py-3 text-primary bg-gray-500/10 text-sm"
                      />
                      <Button
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/meetings?room=${encodeURIComponent(roomName)}`);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        variant="ghost"
                        size="sm"
                        className="px-3"
                      >
                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="text-xs text-secondary">
                    Share the room name or link with others so they can join your meeting.
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MediasoupMeeting;
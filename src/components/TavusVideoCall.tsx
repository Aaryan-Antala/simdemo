import React, { useEffect, useRef, useState } from 'react';
import DailyIframe from '@daily-co/daily-js';
import { Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-react';
const VITE_AI_API_URL = import.meta.env.VITE_AI_API_URL;
const VITE_API_URL = import.meta.env.VITE_API_URL;
const VITE_MEDIA_API_URL = import.meta.env.VITE_MEDIA_API_URL;
const VITE_WORKSPACE_API_URL = import.meta.env.VITE_WORKSPACE_API_URL;
const VITE_APP_URL = import.meta.env.VITE_APP_URL;
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL;
interface TavusVideoCallProps {
  meetingUrl: string;
  onLeave: () => void;
}

const getOrCreateCallObject = () => {
  // Use a property on window to store the singleton
  if (!window._dailyCallObject) {
    window._dailyCallObject = DailyIframe.createCallObject();
  }
  return window._dailyCallObject;
};

const TavusVideoCall: React.FC<TavusVideoCallProps> = ({ meetingUrl, onLeave }) => {
  const callRef = useRef<any>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<any>({});
  const [localParticipant, setLocalParticipant] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only create or get one call object per page
    const call = getOrCreateCallObject();
    callRef.current = call;

    // Join meeting
    const joinMeeting = async () => {
      try {
        // Leave any previous meeting before joining a new one
        if (call.meetingState() !== 'left') {
          await call.leave();
        }

        await call.join({ url: meetingUrl });
        setIsConnected(true);
      } catch (err) {
        console.error('Failed to join meeting:', err);
        setError('Failed to connect to the meeting. Please try again.');
      }
    };

    joinMeeting();

    // Handle participants
    const updateParticipants = () => {
      const participants = call.participants();
      const remotes: any = {};
      let local = null;

      Object.entries(participants).forEach(([id, p]: [string, any]) => {
        if (id === 'local') {
          local = p;
        } else {
          remotes[id] = p;
        }
      });

      setRemoteParticipants(remotes);
      setLocalParticipant(local);
    };

    // Event listeners
    call.on('joined-meeting', () => {
      setIsConnected(true);
      updateParticipants();
    });

    call.on('participant-joined', updateParticipants);
    call.on('participant-updated', updateParticipants);
    call.on('participant-left', updateParticipants);

    call.on('error', (error: any) => {
      console.error('Daily call error:', error);
      setError('Connection error occurred');
    });

    // Cleanup
    return () => {
      if (call && call.meetingState() !== 'left') {
        call.leave();
      }
    };
  }, [meetingUrl]);

  // Attach remote video and audio tracks
  useEffect(() => {
    Object.entries(remoteParticipants).forEach(([id, p]: [string, any]) => {
      // Video
      const videoEl = document.getElementById(`remote-video-${id}`) as HTMLVideoElement;
      if (videoEl && p.tracks?.video && p.tracks.video.state === 'playable' && p.tracks.video.persistentTrack) {
        videoEl.srcObject = new MediaStream([p.tracks.video.persistentTrack]);
      }
      
      // Audio
      const audioEl = document.getElementById(`remote-audio-${id}`) as HTMLAudioElement;
      if (audioEl && p.tracks?.audio && p.tracks.audio.state === 'playable' && p.tracks.audio.persistentTrack) {
        audioEl.srcObject = new MediaStream([p.tracks.audio.persistentTrack]);
      }
    });
  }, [remoteParticipants]);

  const toggleMute = () => {
    if (callRef.current) {
      callRef.current.setLocalAudio(!isMuted);
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (callRef.current) {
      callRef.current.setLocalVideo(!isVideoOff);
      setIsVideoOff(!isVideoOff);
    }
  };

  const handleLeave = () => {
    if (callRef.current && callRef.current.meetingState() !== 'left') {
      callRef.current.leave();
    }
    onLeave();
  };

  const getGameTheme = () => {
    // Determine game theme based on URL or other context
    // For now, we'll use a generic game theme that works for all games
    return {
      title: '🎮 GameMode',
      loadingText: 'Summoning your game companion...',
      waitingText: 'Prepare for an amazing gaming experience!',
      participantName: 'Game Master'
    };
  };

  const theme = getGameTheme();

  if (error) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="glass-panel rounded-2xl p-8 max-w-md mx-auto text-center">
          <h3 className="text-xl font-bold text-primary mb-4">Connection Error</h3>
          <p className="text-secondary mb-6">{error}</p>
          <button
            onClick={handleLeave}
            className="premium-button px-6 py-3 rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="glass-panel rounded-2xl p-8 max-w-md mx-auto text-center">
          <div className="animate-spin w-8 h-8 border-2 border-gold-text border-t-transparent rounded-full mx-auto mb-4"></div>
          <h3 className="text-xl font-bold text-primary mb-2">Connecting to Game...</h3>
          <p className="text-secondary">{theme.loadingText}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary flex flex-col">
      {/* Video Area */}
      <div className="flex-1 p-4">
        <div className="max-w-6xl mx-auto h-full">
          {/* Remote Participants (Tavus Avatar) */}
          <div className="grid grid-cols-1 gap-4 h-full">
            {Object.entries(remoteParticipants).map(([id, p]: [string, any]) => (
              <div
                key={id}
                className="relative glass-panel rounded-2xl overflow-hidden aspect-video"
                style={{
                  background: `
                    linear-gradient(135deg, 
                      rgba(139, 92, 246, 0.1) 0%, 
                      rgba(59, 130, 246, 0.1) 25%,
                      rgba(6, 182, 212, 0.1) 50%,
                      rgba(16, 185, 129, 0.1) 75%,
                      rgba(139, 92, 246, 0.1) 100%
                    ),
                    radial-gradient(circle at 30% 70%, rgba(139, 92, 246, 0.2) 0%, transparent 50%),
                    radial-gradient(circle at 70% 30%, rgba(59, 130, 246, 0.2) 0%, transparent 50%),
                    linear-gradient(45deg, 
                      rgba(16, 185, 129, 0.05) 0%, 
                      rgba(6, 182, 212, 0.05) 100%
                    )
                  `
                }}
              >
                {/* Animated Background Elements */}
                <div className="absolute inset-0 overflow-hidden">
                  {/* Floating Orbs */}
                  <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-full blur-xl animate-float"></div>
                  <div className="absolute top-3/4 right-1/4 w-24 h-24 bg-gradient-to-r from-cyan-500/20 to-green-500/20 rounded-full blur-xl animate-float-delayed"></div>
                  <div className="absolute top-1/2 left-3/4 w-20 h-20 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full blur-xl animate-float-slow"></div>
                  
                  {/* Geometric Patterns */}
                  <div className="absolute top-10 right-10 w-16 h-16 border border-purple-500/30 rotate-45 animate-spin-slow"></div>
                  <div className="absolute bottom-10 left-10 w-12 h-12 border border-cyan-500/30 rotate-12 animate-pulse-slow"></div>
                  
                  {/* Game Symbols */}
                  <div className="absolute top-20 left-20 text-4xl text-purple-500/20 animate-bounce-slow">?</div>
                  <div className="absolute bottom-20 right-20 text-3xl text-blue-500/20 animate-bounce-slow" style={{ animationDelay: '1s' }}>🎮</div>
                  <div className="absolute top-1/2 right-10 text-2xl text-cyan-500/20 animate-bounce-slow" style={{ animationDelay: '2s' }}>💭</div>
                  <div className="absolute bottom-1/3 left-1/4 text-2xl text-green-500/20 animate-bounce-slow" style={{ animationDelay: '3s' }}>🎯</div>
                </div>

                {/* Video Element */}
                <video
                  id={`remote-video-${id}`}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover relative z-10"
                  style={{
                    mixBlendMode: 'normal'
                  }}
                />
                <audio id={`remote-audio-${id}`} autoPlay playsInline />
                
                {/* Participant Info */}
                <div className="absolute bottom-4 left-4 glass-panel px-4 py-2 rounded-lg z-20">
                  <span className="text-primary font-medium flex items-center">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                    {p.user_name || theme.participantName}
                  </span>
                </div>

                {/* Game Theme Overlay */}
                <div className="absolute top-4 right-4 glass-panel px-3 py-2 rounded-lg z-20">
                  <span className="text-sm gradient-gold-silver font-semibold">{theme.title}</span>
                </div>
              </div>
            ))}
            
            {/* Show themed placeholder if no remote participants yet */}
            {Object.keys(remoteParticipants).length === 0 && (
              <div 
                className="relative glass-panel rounded-2xl overflow-hidden aspect-video flex items-center justify-center"
                style={{
                  background: `
                    linear-gradient(135deg, 
                      rgba(139, 92, 246, 0.1) 0%, 
                      rgba(59, 130, 246, 0.1) 25%,
                      rgba(6, 182, 212, 0.1) 50%,
                      rgba(16, 185, 129, 0.1) 75%,
                      rgba(139, 92, 246, 0.1) 100%
                    ),
                    radial-gradient(circle at 50% 50%, rgba(139, 92, 246, 0.2) 0%, transparent 70%)
                  `
                }}
              >
                {/* Animated Background for Loading */}
                <div className="absolute inset-0">
                  <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-full blur-xl animate-float"></div>
                  <div className="absolute top-3/4 right-1/4 w-24 h-24 bg-gradient-to-r from-cyan-500/20 to-green-500/20 rounded-full blur-xl animate-float-delayed"></div>
                </div>
                
                <div className="text-center z-10">
                  <div className="animate-pulse w-20 h-20 bg-gradient-gold-silver rounded-full mx-auto mb-6 flex items-center justify-center">
                    <span className="text-2xl">🎮</span>
                  </div>
                  <p className="text-primary font-medium text-lg mb-2">{theme.loadingText}</p>
                  <p className="text-secondary text-sm">{theme.waitingText}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="glass-panel border-t silver-border p-4">
        <div className="max-w-6xl mx-auto flex justify-center items-center space-x-4">
          <button
            onClick={toggleMute}
            className={`glass-panel p-4 rounded-full glass-panel-hover transition-all ${
              isMuted ? 'bg-red-500/20 border-red-500/50' : ''
            }`}
          >
            {isMuted ? (
              <MicOff className="w-6 h-6 text-red-400" />
            ) : (
              <Mic className="w-6 h-6 text-primary" />
            )}
          </button>

          <button
            onClick={toggleVideo}
            className={`glass-panel p-4 rounded-full glass-panel-hover transition-all ${
              isVideoOff ? 'bg-red-500/20 border-red-500/50' : ''
            }`}
          >
            {isVideoOff ? (
              <VideoOff className="w-6 h-6 text-red-400" />
            ) : (
              <Video className="w-6 h-6 text-primary" />
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

export default TavusVideoCall;
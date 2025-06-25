import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Video, Users, Plus, LogIn, ArrowRight, Copy, Check, Share2, QrCode, Link } from 'lucide-react';
import GlassCard from './ui/GlassCard';
import Button from './ui/Button';
const VITE_AI_API_URL = import.meta.env.VITE_AI_API_URL;
const VITE_API_URL = import.meta.env.VITE_API_URL;
const VITE_MEDIA_API_URL = import.meta.env.VITE_MEDIA_API_URL;
const VITE_WORKSPACE_API_URL = import.meta.env.VITE_WORKSPACE_API_URL;
const VITE_APP_URL = import.meta.env.VITE_APP_URL;
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL;

interface MeetingControlsProps {
  onStartMeeting: (roomName: string, displayName: string) => void;
  onJoinMeeting: (roomName: string, displayName: string) => void;
}

const MeetingControls: React.FC<MeetingControlsProps> = ({ onStartMeeting, onJoinMeeting }) => {
  const [showStartModal, setShowStartModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [generatedRoom, setGeneratedRoom] = useState('');
  const [copied, setCopied] = useState(false);
  const [showShareOptions, setShowShareOptions] = useState(false);

  const generateRoomName = () => {
    const adjectives = ['swift', 'bright', 'clever', 'dynamic', 'focused', 'creative', 'efficient', 'innovative'];
    const nouns = ['meeting', 'session', 'conference', 'discussion', 'workshop', 'sync', 'huddle', 'standup'];
    const randomNum = Math.floor(Math.random() * 1000);
    
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    
    return `${adjective}-${noun}-${randomNum}`;
  };

  const handleStartMeeting = () => {
    const room = generatedRoom || generateRoomName();
    setGeneratedRoom(room);
    
    if (displayName.trim()) {
      onStartMeeting(room, displayName.trim());
      setShowStartModal(false);
      setDisplayName('');
      setGeneratedRoom('');
      setShowShareOptions(false);
    }
  };

  const handleJoinMeeting = () => {
    if (roomName.trim() && displayName.trim()) {
      onJoinMeeting(roomName.trim(), displayName.trim());
      setShowJoinModal(false);
      setDisplayName('');
      setRoomName('');
    }
  };

  const copyRoomName = async () => {
    if (generatedRoom) {
      try {
        await navigator.clipboard.writeText(generatedRoom);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        console.error('Failed to copy room name:', error);
      }
    }
  };

  const copyMeetingLink = async () => {
    if (generatedRoom) {
      const meetingLink = `${window.location.origin}/meetings?room=${encodeURIComponent(generatedRoom)}`;
      try {
        await navigator.clipboard.writeText(meetingLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        console.error('Failed to copy meeting link:', error);
      }
    }
  };

  const shareViaEmail = () => {
    const subject = encodeURIComponent(`Join my video meeting: ${generatedRoom}`);
    const body = encodeURIComponent(`Hi! 

I'd like to invite you to join my video meeting.

Meeting Room: ${generatedRoom}
Meeting Link: ${window.location.origin}/meetings?room=${encodeURIComponent(generatedRoom)}

To join:
1. Click the link above or go to ${window.location.origin}/meetings
2. Click "Join Meeting"
3. Enter the room name: ${generatedRoom}
4. Enter your name and join!

See you there!`);
    
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  const shareViaSMS = () => {
    const message = encodeURIComponent(`Join my video meeting! Room: ${generatedRoom} Link: ${window.location.origin}/meetings?room=${encodeURIComponent(generatedRoom)}`);
    window.open(`sms:?body=${message}`);
  };

  const openStartModal = () => {
    setGeneratedRoom(generateRoomName());
    setShowStartModal(true);
  };

  // Check for room parameter in URL
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl) {
      setRoomName(roomFromUrl);
      setShowJoinModal(true);
    }
  }, []);

  return (
    <>
      {/* Meeting Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        {/* Start Meeting */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <GlassCard className="p-8 text-center" hover goldBorder>
            <div className="w-16 h-16 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center mx-auto mb-6">
              <Video className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-bold text-primary mb-4">Start New Meeting</h3>
            <p className="text-secondary mb-6 text-sm">
              Create a new meeting room and invite others to join your video conference with AI assistance.
            </p>
            <Button
              onClick={openStartModal}
              variant="premium"
              className="w-full flex items-center justify-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Start Meeting</span>
            </Button>
          </GlassCard>
        </motion.div>

        {/* Join Meeting */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <GlassCard className="p-8 text-center" hover goldBorder>
            <div className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center mx-auto mb-6">
              <Users className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-bold text-primary mb-4">Join Meeting</h3>
            <p className="text-secondary mb-6 text-sm">
              Enter a meeting room name to join an existing video conference with AI-powered features.
            </p>
            <Button
              onClick={() => setShowJoinModal(true)}
              variant="secondary"
              className="w-full flex items-center justify-center space-x-2"
            >
              <LogIn className="w-4 h-4" />
              <span>Join Meeting</span>
            </Button>
          </GlassCard>
        </motion.div>
      </div>

      {/* Start Meeting Modal */}
      {showStartModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md"
          >
            <GlassCard className="p-8" goldBorder>
              <h2 className="text-2xl font-bold gradient-gold-silver mb-6">Start New Meeting</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-primary mb-2">
                    Your Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full glass-panel rounded-lg px-4 py-3 text-primary placeholder-secondary focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-primary mb-2">
                    Meeting Room Name
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={generatedRoom}
                      onChange={(e) => setGeneratedRoom(e.target.value)}
                      placeholder="Auto-generated room name"
                      className="flex-1 glass-panel rounded-lg px-4 py-3 text-primary placeholder-secondary focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    />
                    <Button
                      onClick={copyRoomName}
                      variant="ghost"
                      size="sm"
                      className="px-3"
                    >
                      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-secondary mt-1">
                    Share this room name with others to invite them
                  </p>
                </div>

                {/* Share Options */}
                {generatedRoom && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-medium text-primary">
                        Invite Others
                      </label>
                      <Button
                        onClick={() => setShowShareOptions(!showShareOptions)}
                        variant="ghost"
                        size="sm"
                      >
                        <Share2 className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    {showShareOptions && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        className="space-y-2"
                      >
                        <Button
                          onClick={copyMeetingLink}
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start"
                        >
                          <Link className="w-4 h-4 mr-2" />
                          Copy Meeting Link
                        </Button>
                        <Button
                          onClick={shareViaEmail}
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start"
                        >
                          <Share2 className="w-4 h-4 mr-2" />
                          Share via Email
                        </Button>
                        <Button
                          onClick={shareViaSMS}
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start"
                        >
                          <Share2 className="w-4 h-4 mr-2" />
                          Share via SMS
                        </Button>
                      </motion.div>
                    )}
                  </div>
                )}

                <div className="flex space-x-4">
                  <Button
                    onClick={() => {
                      setShowStartModal(false);
                      setShowShareOptions(false);
                    }}
                    variant="secondary"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleStartMeeting}
                    variant="premium"
                    className="flex-1 flex items-center justify-center space-x-2"
                    disabled={!displayName.trim()}
                  >
                    <span>Start Meeting</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      )}

      {/* Join Meeting Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md"
          >
            <GlassCard className="p-8" goldBorder>
              <h2 className="text-2xl font-bold gradient-gold-silver mb-6">Join Meeting</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-primary mb-2">
                    Your Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full glass-panel rounded-lg px-4 py-3 text-primary placeholder-secondary focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-primary mb-2">
                    Meeting Room Name
                  </label>
                  <input
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="Enter room name to join"
                    className="w-full glass-panel rounded-lg px-4 py-3 text-primary placeholder-secondary focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  />
                  <p className="text-xs text-secondary mt-1">
                    Ask the meeting host for the room name
                  </p>
                </div>

                <div className="flex space-x-4">
                  <Button
                    onClick={() => setShowJoinModal(false)}
                    variant="secondary"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleJoinMeeting}
                    variant="premium"
                    className="flex-1 flex items-center justify-center space-x-2"
                    disabled={!displayName.trim() || !roomName.trim()}
                  >
                    <span>Join Meeting</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      )}

      {/* How to Share Instructions */}
      <div className="mt-16 max-w-4xl mx-auto">
        <GlassCard className="p-8">
          <h3 className="text-xl font-bold gradient-gold-silver mb-6 text-center">
            How to Invite Others to Your Meeting
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-bold">1</span>
              </div>
              <h4 className="font-bold text-primary mb-2">Share Room Name</h4>
              <p className="text-secondary text-sm">
                Copy the room name and send it via text, email, or chat
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-bold">2</span>
              </div>
              <h4 className="font-bold text-primary mb-2">Send Meeting Link</h4>
              <p className="text-secondary text-sm">
                Share the direct link that automatically fills in the room name
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-pink-500 to-red-500 flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-bold">3</span>
              </div>
              <h4 className="font-bold text-primary mb-2">They Join</h4>
              <p className="text-secondary text-sm">
                Others click "Join Meeting" and enter the room name
              </p>
            </div>
          </div>
        </GlassCard>
      </div>
    </>
  );
};

export default MeetingControls;
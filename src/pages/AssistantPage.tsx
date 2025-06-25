import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Send, Bot, User, Loader2, Mail, MailOpen, Trash2, CheckSquare, Calendar, Download, RefreshCw, ExternalLink, Check, X, AlertCircle, Inbox, Users, FileText, Zap, ChevronDown, ChevronUp, Eye, Search, Video, Gamepad2, MessageSquare } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import GlassCard from '../components/ui/GlassCard';
import Button from '../components/ui/Button';

const VITE_AI_API_URL = import.meta.env.VITE_AI_API_URL;
const VITE_API_URL = import.meta.env.VITE_API_URL;
const VITE_MEDIA_API_URL = import.meta.env.VITE_MEDIA_API_URL;
const VITE_WORKSPACE_API_URL = import.meta.env.VITE_WORKSPACE_API_URL;
const VITE_APP_URL = import.meta.env.VITE_APP_URL;
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL;

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  type?: 'text' | 'endpoint_result' | 'document_generation';
  data?: any;
}

interface GmailEmail {
  id: string;
  threadId?: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  isUnread: boolean;
  body?: string; // Full email body
  unsubscribeUrl?: string; // Unsubscribe link for promotional/marketing emails
}

interface GmailStatus {
  connected: boolean;
  email?: string;
  unreadCount?: number;
}

const AssistantPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<GmailStatus>({ connected: false });
  const [isCheckingGmail, setIsCheckingGmail] = useState(true);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [showEmailActions, setShowEmailActions] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedEmailForModal, setSelectedEmailForModal] = useState<GmailEmail | null>(null);
  const [loadingEmailBody, setLoadingEmailBody] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    if (urlParams.get('gmail_connected') === 'true') {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: '✅ Gmail connected successfully! You can now ask me to show your emails, search them, or help manage your inbox.',
        timestamp: new Date()
      }]);
      window.history.replaceState({}, '', location.pathname);
    }

    checkGmailStatus();
  }, [user, location]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const checkGmailStatus = async () => {
    if (!user) return;
    
    setIsCheckingGmail(true);
    try {
      const response = await fetch(`${VITE_AI_API_URL}/api/gmail/status?userId=${user.id}`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setGmailStatus(data);
      }
    } catch (error) {
      console.error('Error checking Gmail status:', error);
    } finally {
      setIsCheckingGmail(false);
    }
  };

  const connectGmail = async () => {
    if (!user) return;
    
    try {
      const response = await fetch(`${VITE_AI_API_URL}/api/gmail/auth-url?userId=${user.id}`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          window.location.href = data.authUrl;
        }
      }
    } catch (error) {
      console.error('Error getting Gmail auth URL:', error);
    }
  };

  const disconnectGmail = async () => {
    if (!user) return;
    
    try {
      const response = await fetch(`${VITE_AI_API_URL}/api/gmail/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: user.id })
      });
      
      if (response.ok) {
        setGmailStatus({ connected: false });
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: '📧 Gmail disconnected successfully.',
          timestamp: new Date()
        }]);
      }
    } catch (error) {
      console.error('Error disconnecting Gmail:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const agentResponse = await fetch(`${VITE_AI_API_URL}/api/chat/agent-process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: userMessage.content,
          userId: user?.id,
          context: { gmailConnected: gmailStatus.connected }
        })
      });

      if (!agentResponse.ok) {
        throw new Error('Failed to process message');
      }

      const agentData = await agentResponse.json();
      
      if (agentData.success && agentData.agent) {
        const agent = agentData.agent;
        
        if (agent.intent === 'endpoint_call') {
          // Handle endpoint call results
          const assistantMessage: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: agent.response,
            timestamp: new Date(),
            type: 'endpoint_result',
            data: agent.result
          };
          setMessages(prev => [...prev, assistantMessage]);
        } else {
          // Handle general chat
          const assistantMessage: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: agent.response,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, assistantMessage]);
        }
      } else {
        throw new Error('Invalid agent response');
      }
    } catch (error) {
      console.error('Error processing message:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error processing your request. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSelection = (emailId: string, selected: boolean) => {
    setSelectedEmails(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(emailId);
      } else {
        newSet.delete(emailId);
      }
      setShowEmailActions(newSet.size > 0);
      return newSet;
    });
  };

  const handleSelectAllEmails = (emails: GmailEmail[], selectAll: boolean) => {
    if (selectAll) {
      setSelectedEmails(new Set(emails.map(email => email.id)));
      setShowEmailActions(true);
    } else {
      setSelectedEmails(new Set());
      setShowEmailActions(false);
    }
  };

  const handleDeleteSelectedEmails = async () => {
    if (!user || selectedEmails.size === 0) return;

    try {
      const response = await fetch(`${VITE_AI_API_URL}/api/gmail/delete-emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId: user.id,
          messageIds: Array.from(selectedEmails)
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Update messages to remove deleted emails from email lists
          setMessages(prev => prev.map(message => {
            if (message.type === 'endpoint_result' && message.data?.emails) {
              const updatedEmails = message.data.emails.filter((email: GmailEmail) => 
                !selectedEmails.has(email.id)
              );
              
              return {
                ...message,
                data: {
                  ...message.data,
                  emails: updatedEmails
                },
                content: `📧 Found ${updatedEmails.length} emails (updated after deletion)`
              };
            }
            return message;
          }));

          setSelectedEmails(new Set());
          setShowEmailActions(false);
          
          const successMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'assistant',
            content: `✅ Successfully deleted ${data.deleted} emails. ${data.failed > 0 ? `Failed to delete ${data.failed} emails.` : ''}`,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, successMessage]);
        }
      }
    } catch (error) {
      console.error('Error deleting emails:', error);
    }
  };

  const handleViewEmail = async (email: GmailEmail) => {
    setSelectedEmailForModal(email);
    setShowEmailModal(true);
    
    // If email body is not loaded, fetch it
    if (!email.body) {
      setLoadingEmailBody(true);
      
      try {
        const response = await fetch(`${VITE_AI_API_URL}/api/gmail/email/${email.id}?userId=${user?.id}`, {
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            // Update the email in messages with full body
            setMessages(prev => prev.map(message => {
              if (message.type === 'endpoint_result' && message.data?.emails) {
                const updatedEmails = message.data.emails.map((e: GmailEmail) => 
                  e.id === email.id ? { ...e, body: data.email.body } : e
                );
                
                return {
                  ...message,
                  data: {
                    ...message.data,
                    emails: updatedEmails
                  }
                };
              }
              return message;
            }));
            
            // Update the modal email
            setSelectedEmailForModal(prev => prev ? { ...prev, body: data.email.body } : null);
          }
        }
      } catch (error) {
        console.error('Error fetching email body:', error);
      } finally {
        setLoadingEmailBody(false);
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (timestamp: Date) => {
    return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatEmailDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString([], { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderEmailList = (emails: GmailEmail[], hasPromotions?: boolean) => {
    if (!emails || emails.length === 0) {
      return (
        <div className="text-center py-8">
          <Inbox className="w-12 h-12 text-secondary mx-auto mb-4 opacity-50" />
          <p className="text-secondary">No emails found</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Email Actions Bar */}
        <div className="flex items-center justify-between p-3 glass-panel rounded-lg">
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedEmails.size === emails.length && emails.length > 0}
                onChange={(e) => handleSelectAllEmails(emails, e.target.checked)}
                className="rounded border-gray-300 text-yellow-500 focus:ring-yellow-500"
              />
              <span className="text-sm text-secondary">
                {selectedEmails.size > 0 ? `${selectedEmails.size} selected` : 'Select all'}
              </span>
            </label>
          </div>

          {showEmailActions && (
            <Button
              onClick={handleDeleteSelectedEmails}
              variant="secondary"
              size="sm"
              className="flex items-center space-x-2 bg-red-500/20 border-red-500/50 hover:bg-red-500/30"
            >
              <Trash2 className="w-4 h-4 text-red-400" />
              <span className="text-red-400">Delete Selected</span>
            </Button>
          )}
        </div>

        {/* Email List */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {emails.map((email) => (
            <div
              key={email.id}
              className={`glass-panel rounded-lg border transition-all ${
                selectedEmails.has(email.id) ? 'border-yellow-500 bg-yellow-500/10' : ''
              }`}
            >
              <div className="p-4">
                <div className="flex items-start space-x-3">
                  <input
                    type="checkbox"
                    checked={selectedEmails.has(email.id)}
                    onChange={(e) => handleEmailSelection(email.id, e.target.checked)}
                    className="mt-1 rounded border-gray-300 text-yellow-500 focus:ring-yellow-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-xs text-secondary">{email.from}</span>
                      {email.isUnread && <span className="ml-2 text-xs text-yellow-500 font-bold">Unread</span>}
                      <span className="text-xs text-secondary">{formatEmailDate(email.date)}</span>
                    </div>
                    <h4 className={`font-medium mb-1 truncate ${email.isUnread ? 'text-primary' : 'text-secondary'}`}>
                      {email.subject}
                    </h4>
                    <p className="text-sm text-secondary line-clamp-2 mb-2">
                      {email.snippet}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      onClick={() => handleViewEmail(email)}
                      variant="ghost"
                      size="sm"
                      className="text-xs flex items-center space-x-1"
                    >
                      <Eye className="w-3 h-3" />
                      <span>View</span>
                    </Button>
                    {hasPromotions && email.unsubscribeUrl && (
                      <Button
                        onClick={() => window.open(email.unsubscribeUrl, '_blank')}
                        variant="secondary"
                        size="sm"
                        className="text-xs text-red-500 border-red-400"
                      >
                        Unsubscribe
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderEndpointResult = (data: any) => {
    if (!data) return null;

    // Gmail results
    if (data.emails) {
      // Check if these are promotional/marketing emails (by presence of unsubscribeUrl)
      const hasPromotions = data.emails.some((email: any) => email.unsubscribeUrl);
      return renderEmailList(data.emails, hasPromotions);
    }

    // Task results
    if (data.tasks) {
      return (
        <div className="space-y-3">
          <h4 className="font-medium text-primary mb-2 flex items-center">
            <CheckSquare className="w-4 h-4 mr-2" />
            Tasks ({data.tasks.length})
          </h4>
          {data.tasks.map((task: any, index: number) => (
            <div key={index} className="glass-panel p-3 rounded-lg">
              <h5 className="font-medium text-primary">{task.title}</h5>
              {task.description && <p className="text-sm text-secondary mt-1">{task.description}</p>}
              <div className="flex items-center space-x-4 mt-2 text-xs text-secondary">
                <span className="capitalize">{task.priority} priority</span>
                <span className="capitalize">{task.status}</span>
                {task.due_date && <span>Due: {new Date(task.due_date).toLocaleDateString()}</span>}
              </div>
            </div>
          ))}
        </div>
      );
    }

    // Calendar events
    if (data.events) {
      return (
        <div className="space-y-3">
          <h4 className="font-medium text-primary mb-2 flex items-center">
            <Calendar className="w-4 h-4 mr-2" />
            Events ({data.events.length})
          </h4>
          {data.events.map((event: any, index: number) => (
            <div key={index} className="glass-panel p-3 rounded-lg">
              <h5 className="font-medium text-primary">{event.title}</h5>
              {event.description && <p className="text-sm text-secondary mt-1">{event.description}</p>}
              <div className="text-xs text-secondary mt-2">
                {new Date(event.start_time).toLocaleString()} - {new Date(event.end_time).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      );
    }

    // Document generation
    if (data.document) {
      return (
        <div className="glass-panel p-4 rounded-lg bg-green-500/10 border-green-500/30">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-green-400 flex items-center">
              <FileText className="w-4 h-4 mr-2" />
              Generated Document
            </h4>
            <Button
              onClick={() => {
                const blob = new Blob([data.document.content], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'document.html';
                a.click();
                URL.revokeObjectURL(url);
              }}
              variant="ghost"
              size="sm"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
          <div 
            className="prose prose-sm max-w-none text-secondary"
            dangerouslySetInnerHTML={{ __html: data.document.content.substring(0, 500) + '...' }}
          />
        </div>
      );
    }

    // Meeting room
    if (data.room) {
      return (
        <div className="glass-panel p-4 rounded-lg bg-blue-500/10 border-blue-500/30">
          <h4 className="font-medium text-blue-400 flex items-center mb-2">
            <Video className="w-4 h-4 mr-2" />
            Meeting Room Created
          </h4>
          <p className="text-sm text-secondary mb-3">Room: {data.room.name}</p>
          <Button
            onClick={() => window.open(data.room.url, '_blank')}
            variant="secondary"
            size="sm"
            className="flex items-center space-x-2"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Join Meeting</span>
          </Button>
        </div>
      );
    }

    // Game conversation
    if (data.conversation_url) {
      return (
        <div className="glass-panel p-4 rounded-lg bg-purple-500/10 border-purple-500/30">
          <h4 className="font-medium text-purple-400 flex items-center mb-2">
            <Gamepad2 className="w-4 h-4 mr-2" />
            Game Started
          </h4>
          <p className="text-sm text-secondary mb-3">Your game session is ready!</p>
          <Button
            onClick={() => window.open(data.conversation_url, '_blank')}
            variant="secondary"
            size="sm"
            className="flex items-center space-x-2"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Start Playing</span>
          </Button>
        </div>
      );
    }

    // Generic success message
    if (data.success) {
      return (
        <div className="glass-panel p-3 rounded-lg bg-green-500/10 border-green-500/30">
          <p className="text-green-400 text-sm">✅ Operation completed successfully</p>
          {data.message && <p className="text-secondary text-sm mt-1">{data.message}</p>}
        </div>
      );
    }

    return null;
  };

  const renderMessage = (message: ChatMessage) => {
    const isUser = message.role === 'user';
    
    return (
      <motion.div
        key={message.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex items-start space-x-3 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}
      >
        {/* Avatar */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          isUser ? 'bg-gradient-to-r from-blue-500 to-purple-500' : 'bg-gradient-gold-silver'
        }`}>
          {isUser ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
        </div>

        {/* Message */}
        <div className={`glass-panel rounded-2xl p-4 max-w-4xl ${
          isUser ? 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/30' : 'border-gold-border'
        }`}>
          {/* Message content */}
          <p className="text-primary whitespace-pre-wrap mb-2">{message.content}</p>

          {/* Endpoint results */}
          {message.type === 'endpoint_result' && message.data && (
            <div className="mt-4">
              {renderEndpointResult(message.data)}
            </div>
          )}

          {/* Timestamp */}
          <div className="text-xs text-secondary mt-2">
            {formatTime(message.timestamp)}
          </div>
        </div>
      </motion.div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="glass-panel rounded-2xl p-8 max-w-md mx-auto text-center">
          <div className="animate-spin w-8 h-8 border-2 border-gold-text border-t-transparent rounded-full mx-auto mb-4"></div>
          <h3 className="text-xl font-bold text-primary mb-2">Loading Assistant...</h3>
          <p className="text-secondary">Verifying your session</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary flex flex-col">
      {/* Header */}
      <header className="glass-panel border-0 border-b silver-border">
        <div className="max-w-7xl mx-auto container-padding">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <motion.button
                onClick={() => navigate('/dashboard')}
                className="glass-panel p-2 rounded-full glass-panel-hover"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                <ArrowLeft className="w-5 h-5 text-secondary" />
              </motion.button>
              <div>
                <h1 className="text-lg font-bold gradient-gold-silver">
                  AI Assistant
                </h1>
                <p className="text-xs text-secondary">
                  Complete workspace & productivity assistant
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {/* Gmail Status */}
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${
                  isCheckingGmail ? 'bg-yellow-500 animate-pulse' : 
                  gmailStatus.connected ? 'bg-green-500' : 'bg-gray-500'
                }`} />
                <span className="text-sm text-secondary">
                  Gmail {gmailStatus.connected ? 'Connected' : 'Disconnected'}
                </span>
                {gmailStatus.connected ? (
                  <Button
                    onClick={disconnectGmail}
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    onClick={connectGmail}
                    variant="secondary"
                    size="sm"
                    className="text-xs"
                  >
                    Connect Gmail
                  </Button>
                )}
              </div>
              
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col max-w-6xl mx-auto w-full">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <Bot className="w-16 h-16 text-secondary mx-auto mb-6 opacity-50" />
              <h3 className="text-xl font-bold text-primary mb-4">Welcome to Your Powerful AI Assistant</h3>
              <p className="text-secondary mb-6 max-w-2xl mx-auto">
                I can help you with Gmail management, workspace tasks, calendar events, meetings, document generation, games, and general questions. 
                {!gmailStatus.connected && ' Connect your Gmail to unlock email management features.'}
              </p>
              
              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
                {[
                  { icon: Mail, text: 'Show my unread emails', disabled: !gmailStatus.connected },
                  { icon: CheckSquare, text: 'Create a task for tomorrow', disabled: false },
                  { icon: Calendar, text: 'Schedule a meeting for 2pm', disabled: false },
                  { icon: Video, text: 'Create a meeting room', disabled: false },
                  { icon: FileText, text: 'Generate a project proposal', disabled: false },
                  { icon: Gamepad2, text: 'Start a riddle game', disabled: false },
                  { icon: Search, text: 'Search emails about "project"', disabled: !gmailStatus.connected },
                  { icon: MessageSquare, text: 'What is quantum computing?', disabled: false },
                ].map((action, index) => (
                  <button
                    key={index}
                    onClick={() => !action.disabled && setInputMessage(action.text)}
                    disabled={action.disabled}
                    className={`glass-panel p-4 rounded-lg text-center transition-all ${
                      action.disabled 
                        ? 'opacity-50 cursor-not-allowed' 
                        : 'glass-panel-hover cursor-pointer'
                    }`}
                  >
                    <action.icon className={`w-6 h-6 mx-auto mb-2 ${
                      action.disabled ? 'text-gray-500' : 'gold-text'
                    }`} />
                    <p className={`text-sm ${action.disabled ? 'text-gray-500' : 'text-primary'}`}>
                      {action.text}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <AnimatePresence>
            {messages.map(renderMessage)}
          </AnimatePresence>

          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start space-x-3"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-gold-silver flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="glass-panel rounded-2xl p-4 border-gold-border">
                <div className="flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin text-secondary" />
                  <span className="text-secondary">Processing your request...</span>
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="glass-panel border-t silver-border p-6">
          <div className="flex items-end space-x-4">
            <div className="flex-1">
              <textarea
                ref={inputRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me anything: manage emails, create tasks, schedule meetings, generate documents, play games, or general questions..."
                className="w-full glass-panel rounded-xl px-4 py-3 text-primary placeholder-secondary focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-none min-h-[50px] max-h-32"
                rows={1}
              />
              <div className="flex items-center justify-between mt-2">
                <div className="text-xs text-secondary">
                  {gmailStatus.connected ? (
                    <span className="flex items-center space-x-1">
                      <Check className="w-3 h-3 text-green-500" />
                      <span>All features available - Gmail connected</span>
                    </span>
                  ) : (
                    <span className="flex items-center space-x-1">
                      <AlertCircle className="w-3 h-3 text-yellow-500" />
                      <span>Connect Gmail for email management features</span>
                    </span>
                  )}
                </div>
                <div className="text-xs text-secondary">
                  Enter to send • Shift+Enter for new line
                </div>
              </div>
            </div>

            <Button
              onClick={handleSendMessage}
              variant="premium"
              size="sm"
              className="p-3"
              disabled={!inputMessage.trim() || isLoading}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Email Modal */}
      <AnimatePresence>
        {showEmailModal && selectedEmailForModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-4xl max-h-[100vh] flex overflow-hidden"
            >
              <GlassCard className="flex flex-col h-full w-full max-h-[100vh] overflow-y-auto" goldBorder>
                {/* Modal Header */}
                <div className="flex items-center justify-between p-6 border-b silver-border">
                  <div className="flex items-center space-x-3">
                    <Mail className="w-6 h-6 gold-text" />
                    <div>
                      <h2 className="text-lg font-bold text-primary">Email Details</h2>
                      <p className="text-sm text-secondary">
                        From: {selectedEmailForModal.from} • {formatEmailDate(selectedEmailForModal.date)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowEmailModal(false)}
                    className="text-secondary hover:text-primary p-2 rounded-lg glass-panel glass-panel-hover"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-transparent dark:bg-[#18181b]">
                  {/* Subject */}
                  <div className="mb-6">
                    <h3 className="text-xl font-bold text-primary mb-2">
                      {selectedEmailForModal.subject}
                    </h3>
                    <div className="flex items-center space-x-4 text-sm text-secondary">
                      <span>From: {selectedEmailForModal.from}</span>
                      <span>Date: {formatEmailDate(selectedEmailForModal.date)}</span>
                      {selectedEmailForModal.isUnread && (
                        <span className="px-2 py-1 bg-yellow-500/20 text-yellow-500 rounded-full text-xs font-medium">
                          Unread
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Email Body */}
                  <div className="glass-panel p-4 rounded-lg max-h-[50vh] overflow-y-auto bg-white dark:bg-[#23232a]">
                    {loadingEmailBody ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-secondary mr-3" />
                        <span className="text-secondary">Loading email content...</span>
                      </div>
                    ) : selectedEmailForModal.body ? (
                      <div 
                        className="prose prose-sm max-w-none text-primary dark:text-gray-100 dark:prose-invert"
                        dangerouslySetInnerHTML={{ __html: selectedEmailForModal.body }}
                      />
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-secondary mb-4">Email content preview:</p>
                        <p className="text-primary whitespace-pre-wrap">
                          {selectedEmailForModal.snippet}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {selectedEmailForModal.unsubscribeUrl && (
                    <div className="mt-6 p-4 glass-panel rounded-lg bg-orange-500/10 border-orange-500/30 dark:bg-orange-900/20">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-orange-400 mb-1">Promotional Email</h4>
                          <p className="text-sm text-secondary">This appears to be a promotional email with an unsubscribe option.</p>
                        </div>
                        <Button
                          onClick={() => window.open(selectedEmailForModal.unsubscribeUrl, '_blank')}
                          variant="secondary"
                          size="sm"
                          className="text-orange-500 border-orange-400"
                        >
                          Unsubscribe
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end space-x-3 p-6 border-t silver-border">
                  <Button
                    onClick={() => setShowEmailModal(false)}
                    variant="secondary"
                  >
                    Close
                  </Button>
                  {/* <Button
                    onClick={async () => {
                      if (selectedEmailForModal) {
                        setSelectedEmails(new Set([selectedEmailForModal.id]));
                        await handleDeleteSelectedEmails();
                        setShowEmailModal(false);
                      }
                    }}
                    variant="secondary"
                    className="bg-red-500/20 border-red-500/50 hover:bg-red-500/30"
                  >
                    <Trash2 className="w-4 h-4 mr-2 text-red-400" />
                    <span className="text-red-400">Delete Email</span>
                  </Button> */}
                </div>
              </GlassCard>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AssistantPage;
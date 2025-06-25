import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Hash, AtSign, Smile, Paperclip, MoreVertical, Reply, Edit, Trash2, Pin, Image, FileText, Download, Play, Pause, Volume2, VolumeX, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../contexts/AuthContext';
import { type Channel, type Message } from '../lib/supabase';
import Button from './ui/Button';

interface ChatPanelProps {
  channel: Channel | null;
  messages: Message[];
  onSendMessage: (content: string, mentions?: string[], attachments?: File[]) => void;
  onEditMessage: (messageId: string, newContent: string) => void;
  onDeleteMessage: (messageId: string) => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ 
  channel, 
  messages, 
  onSendMessage, 
  onEditMessage, 
  onDeleteMessage 
}) => {
  const { user } = useAuth();
  const [messageInput, setMessageInput] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editContent, setEditContent] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [showMessageMenu, setShowMessageMenu] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    // Auto-resize textarea
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
    }
  }, [messageInput, editContent]);

  const handleSendMessage = () => {
    if ((!messageInput.trim() && attachments.length === 0) || !channel) return;

    let content = messageInput.trim();
    
    // Add reply reference if replying
    if (replyingTo) {
      content = `@${replyingTo.sender?.username || 'user'} ${content}`;
    }

    onSendMessage(content || '[Media]', mentions, attachments);
    setMessageInput('');
    setMentions([]);
    setAttachments([]);
    setReplyingTo(null);
    setEditingMessage(null);
  };

  const handleEditSubmit = () => {
    if (!editingMessage || !editContent.trim()) return;
    
    onEditMessage(editingMessage.id, editContent.trim());
    setEditingMessage(null);
    setEditContent('');
  };

  const handleEditCancel = () => {
    setEditingMessage(null);
    setEditContent('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (editingMessage) {
        handleEditSubmit();
      } else {
        handleSendMessage();
      }
    } else if (e.key === 'Escape' && editingMessage) {
      handleEditCancel();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    
    if (editingMessage) {
      setEditContent(value);
    } else {
      setMessageInput(value);
      
      // Extract mentions
      const mentionMatches = value.match(/@(\w+)/g);
      if (mentionMatches) {
        const extractedMentions = mentionMatches.map(mention => mention.substring(1));
        setMentions(extractedMentions);
      } else {
        setMentions([]);
      }

      // Show typing indicator
      setIsTyping(true);
      setTimeout(() => setIsTyping(false), 1000);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments(prev => [...prev, ...files]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    setAttachments(prev => [...prev, ...files]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const getMessageIcon = (message: Message) => {
    switch (message.type) {
      case 'ai_task_creation':
      case 'ai_summary':
        return <Bot className="w-4 h-4 text-blue-500" />;
      case 'system':
        return <Hash className="w-4 h-4 text-gray-500" />;
      default:
        return <User className="w-4 h-4 text-primary" />;
    }
  };

  const getMessageStyle = (message: Message) => {
    switch (message.type) {
      case 'ai_task_creation':
        return 'bg-blue-500/10 border-blue-500/30';
      case 'ai_summary':
        return 'bg-purple-500/10 border-purple-500/30 pb-3';
      case 'system':
        return 'bg-gray-500/10 border-gray-500/30';
      default:
        return message.sender_id === user?.id 
          ? 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/30'
          : 'border-gold-border';
    }
  };

  const renderMessageContent = (content: string, messageType?: string) => {
    // For AI summary messages, use ReactMarkdown
    if (messageType === 'ai_summary') {
      return (
        <div className="markdown-summary w-full overflow-hidden break-words">
          <ReactMarkdown
            components={{
              h1: ({node, ...props}) => <h1 className="text-xl font-bold mb-2 text-purple-400 break-words" {...props} />,
              h2: ({node, ...props}) => <h2 className="text-lg font-bold mb-2 text-purple-300 break-words" {...props} />,
              h3: ({node, ...props}) => <h3 className="text-md font-bold mb-1 text-purple-200 break-words" {...props} />,
              ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-2 space-y-1" {...props} />,
              ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...props} />,
              li: ({node, ...props}) => <li className="mb-1" {...props} />,
              p: ({node, ...props}) => <p className="mb-2 break-words" {...props} />,
              strong: ({node, ...props}) => <strong className="font-bold text-purple-300" {...props} />,
              code: ({node, ...props}) => <code className="bg-purple-500/10 px-1 rounded text-sm font-mono break-words" {...props} />,
              pre: ({node, ...props}) => <pre className="bg-purple-500/10 p-2 rounded my-2 overflow-x-auto max-w-full" {...props} />,
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      );
    }
    
    // For regular messages, render mentions with highlighting
    const parts = content.split(/(@\w+)/g);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        return (
          <span key={index} className="bg-yellow-500/20 text-yellow-600 px-1 rounded">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const renderAttachment = (attachment: any, messageId: string) => {
    const fileType = attachment.type?.split('/')[0];
    const fileName = attachment.name || 'Unknown file';
    const fileSize = attachment.size ? `${(attachment.size / 1024 / 1024).toFixed(1)}MB` : '';

    switch (fileType) {
      case 'image':
        return (
          <div key={attachment.id} className="mt-2 rounded-lg overflow-hidden max-w-sm">
            <img 
              src={attachment.url} 
              alt={fileName}
              className="w-full h-auto max-h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => window.open(attachment.url, '_blank')}
            />
            <div className="p-2 bg-black/20 text-xs text-white">
              {fileName} • {fileSize}
            </div>
          </div>
        );
      
      case 'video':
        return (
          <div key={attachment.id} className="mt-2 rounded-lg overflow-hidden max-w-sm">
            <video 
              controls 
              className="w-full h-auto max-h-64"
              preload="metadata"
            >
              <source src={attachment.url} type={attachment.type} />
              Your browser does not support the video tag.
            </video>
            <div className="p-2 bg-black/20 text-xs text-white">
              {fileName} • {fileSize}
            </div>
          </div>
        );
      
      case 'audio':
        return (
          <div key={attachment.id} className="mt-2 glass-panel rounded-lg p-3 max-w-sm">
            <div className="flex items-center space-x-3">
              <Volume2 className="w-5 h-5 text-secondary" />
              <div className="flex-1">
                <p className="text-sm font-medium text-primary">{fileName}</p>
                <p className="text-xs text-secondary">{fileSize}</p>
              </div>
            </div>
            <audio controls className="w-full mt-2">
              <source src={attachment.url} type={attachment.type} />
              Your browser does not support the audio tag.
            </audio>
          </div>
        );
      
      default:
        return (
          <div key={attachment.id} className="mt-2 glass-panel rounded-lg p-3 max-w-sm">
            <div className="flex items-center space-x-3">
              <FileText className="w-5 h-5 text-secondary" />
              <div className="flex-1">
                <p className="text-sm font-medium text-primary">{fileName}</p>
                <p className="text-xs text-secondary">{fileSize}</p>
              </div>
              <Button
                onClick={() => window.open(attachment.url, '_blank')}
                variant="ghost"
                size="sm"
                className="p-1"
              >
                <Download className="w-4 h-4" />
              </Button>
            </div>
          </div>
        );
    }
  };

  const handleReply = (message: Message) => {
    setReplyingTo(message);
    inputRef.current?.focus();
  };

  const handleEdit = (message: Message) => {
    setEditingMessage(message);
    setEditContent(message.content);
    setShowMessageMenu(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleDelete = (message: Message) => {
    if (confirm('Are you sure you want to delete this message?')) {
      onDeleteMessage(message.id);
      setShowMessageMenu(null);
    }
  };

  const emojis = ['😀', '😂', '😍', '🤔', '👍', '👎', '❤️', '🎉', '🔥', '💯'];

  const addEmoji = (emoji: string) => {
    if (editingMessage) {
      setEditContent(prev => prev + emoji);
    } else {
      setMessageInput(prev => prev + emoji);
    }
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  const getFileIcon = (file: File) => {
    const type = file.type.split('/')[0];
    switch (type) {
      case 'image': return <Image className="w-4 h-4" />;
      case 'video': return <Play className="w-4 h-4" />;
      case 'audio': return <Volume2 className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  if (!channel) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Hash className="w-16 h-16 text-secondary mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-bold text-primary mb-2">Welcome to Workspace</h3>
          <p className="text-secondary">Select a channel to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`flex-1 flex flex-col h-full ${dragOver ? 'bg-blue-500/10' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Channel Header - Fixed at the top */}
      <div className="glass-panel border-b silver-border p-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-gold-silver flex items-center justify-center">
              <Hash className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-primary">{channel.name}</h2>
              {channel.description && (
                <p className="text-sm text-secondary">{channel.description}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Drag & Drop Overlay */}
      {dragOver && (
        <div className="absolute inset-0 bg-blue-500/20 border-2 border-dashed border-blue-500 flex items-center justify-center z-10">
          <div className="text-center">
            <Paperclip className="w-12 h-12 text-blue-500 mx-auto mb-4" />
            <p className="text-blue-500 font-medium">Drop files here to share</p>
          </div>
        </div>
      )}

      {/* Messages - Scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ scrollbarWidth: 'thin' }}>
        <AnimatePresence>
          {messages.map((message, index) => {
            const isConsecutive = index > 0 && 
              messages[index - 1].sender_id === message.sender_id &&
              new Date(message.created_at).getTime() - new Date(messages[index - 1].created_at).getTime() < 300000; // 5 minutes

            return (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={`group ${
                  message.sender_id === user?.id ? 'flex flex-row-reverse' : 'flex'
                }`}
              >
                <div className={`flex items-start space-x-3 max-w-4xl w-full ${
                  message.sender_id === user?.id ? 'flex-row-reverse space-x-reverse' : ''
                }`}>
                  {/* Avatar */}
                  {!isConsecutive && (
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      message.type === 'ai_task_creation' || message.type === 'ai_summary'
                        ? 'bg-gradient-to-r from-blue-500 to-purple-500'
                        : message.sender_id === user?.id
                        ? 'bg-gradient-to-r from-blue-500 to-purple-500'
                        : 'bg-gradient-gold-silver'
                    }`}>
                      {getMessageIcon(message)}
                    </div>
                  )}
                  
                  {isConsecutive && (
                    <div className="w-8 h-8 flex-shrink-0" />
                  )}

                  {/* Message */}
                  <div className={`glass-panel rounded-2xl p-4 relative ${getMessageStyle(message)} ${
                    isConsecutive ? 'mt-1' : ''
                  }`}>
                    {/* Sender info */}
                    {!isConsecutive && (
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-primary text-sm">
                            {message.type === 'ai_task_creation' || message.type === 'ai_summary'
                              ? 'AI Assistant'
                              : message.sender?.full_name || 'Unknown User'}
                          </span>
                          <span className="text-xs text-secondary">
                            {formatTime(message.created_at)}
                          </span>
                          {message.edited_at && (
                            <span className="text-xs text-secondary opacity-75">(edited)</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Message content */}
                    {editingMessage?.id === message.id ? (
                      <div className="space-y-2">
                        <textarea
                          ref={inputRef}
                          value={editContent}
                          onChange={handleInputChange}
                          onKeyPress={handleKeyPress}
                          className="w-full glass-panel rounded-lg px-3 py-2 text-primary focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-none"
                          rows={1}
                          autoFocus
                        />
                        <div className="flex items-center space-x-2">
                          <Button
                            onClick={handleEditSubmit}
                            variant="premium"
                            size="sm"
                            className="text-xs"
                          >
                            <Check className="w-3 h-3 mr-1" />
                            Save
                          </Button>
                          <Button
                            onClick={handleEditCancel}
                            variant="secondary"
                            size="sm"
                            className="text-xs"
                          >
                            <X className="w-3 h-3 mr-1" />
                            Cancel
                          </Button>
                          <span className="text-xs text-secondary">
                            Escape to cancel • Enter to save
                          </span>
                        </div>
                      </div>
                    ) : (
                      <>
                        {message.content && message.content !== '[Media]' && (
                          <div className={`text-primary max-w-full ${message.type !== 'ai_summary' ? 'whitespace-pre-wrap' : 'overflow-hidden'}`}>
                            {renderMessageContent(message.content, message.type)}
                          </div>
                        )}

                        {/* Attachments */}
                        {message.metadata?.attachments && message.metadata.attachments.map((attachment: any) => 
                          renderAttachment(attachment, message.id)
                        )}

                        {/* Task metadata */}
                        {message.type === 'ai_task_creation' && message.metadata?.task_id && (
                          <div className="mt-2 p-2 glass-panel rounded-lg bg-green-500/10 border-green-500/30">
                            <p className="text-green-400 text-xs font-medium">
                              ✓ Task created successfully
                            </p>
                          </div>
                        )}
                      </>
                    )}

                    {/* Message actions */}
                    {editingMessage?.id !== message.id && (
                      <div className={`absolute top-2 ${
                        message.sender_id === user?.id ? 'left-2' : 'right-2'
                      } opacity-0 group-hover:opacity-100 transition-opacity`}>
                        <div className="flex items-center space-x-1 glass-panel rounded-lg p-1">
                          <button
                            onClick={() => handleReply(message)}
                            className="p-1 hover:bg-surface rounded"
                            title="Reply"
                          >
                            <Reply className="w-3 h-3 text-secondary" />
                          </button>
                          {message.sender_id === user?.id && message.type === 'text' && (
                            <>
                              <button
                                onClick={() => handleEdit(message)}
                                className="p-1 hover:bg-surface rounded"
                                title="Edit"
                              >
                                <Edit className="w-3 h-3 text-secondary" />
                              </button>
                              <button
                                onClick={() => handleDelete(message)}
                                className="p-1 hover:bg-surface rounded"
                                title="Delete"
                              >
                                <Trash2 className="w-3 h-3 text-red-400" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {messages.length === 0 && (
          <div className="text-center py-12">
            <Hash className="w-12 h-12 text-secondary mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-bold text-primary mb-2">Start the conversation</h3>
            <p className="text-secondary">
              Be the first to send a message in #{channel.name}
            </p>
          </div>
        )}

        {/* Typing indicator */}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center space-x-2 text-secondary text-sm"
          >
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-secondary rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-secondary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-secondary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
            <span>Someone is typing...</span>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Reply indicator */}
      {replyingTo && !editingMessage && (
        <div className="px-4 py-2 glass-panel border-t border-b silver-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-sm">
              <Reply className="w-4 h-4 text-secondary" />
              <span className="text-secondary">Replying to</span>
              <span className="font-medium text-primary">
                {replyingTo.sender?.full_name}
              </span>
              <span className="text-secondary truncate max-w-xs">
                {replyingTo.content}
              </span>
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              className="text-secondary hover:text-primary"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Attachments Preview */}
      {attachments.length > 0 && !editingMessage && (
        <div className="px-4 py-2 glass-panel border-t silver-border">
          <div className="flex items-center space-x-2 mb-2">
            <Paperclip className="w-4 h-4 text-secondary" />
            <span className="text-sm font-medium text-primary">
              {attachments.length} file{attachments.length > 1 ? 's' : ''} attached
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {attachments.map((file, index) => (
              <div key={index} className="flex items-center space-x-2 glass-panel rounded-lg p-2">
                {getFileIcon(file)}
                <span className="text-xs text-primary truncate max-w-32">
                  {file.name}
                </span>
                <button
                  onClick={() => removeAttachment(index)}
                  className="text-red-400 hover:text-red-300"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Message Input - Fixed at bottom */}
      {!editingMessage && (
        <div className="glass-panel border-t silver-border p-4 flex-shrink-0">
          <div className="flex items-end space-x-4">
            <div className="flex-1">
              <div className="relative">
                <textarea
                  ref={inputRef}
                  value={messageInput}
                  onChange={handleInputChange}
                  onKeyPress={handleKeyPress}
                  placeholder={`Message #${channel.name}... (use @username to mention)`}
                  className="w-full glass-panel rounded-xl px-4 py-3 pr-20 text-primary placeholder-secondary focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-none min-h-[50px] max-h-32"
                  rows={1}
                />
                
                {/* Input actions */}
                <div className="absolute right-2 bottom-2 flex items-center space-x-1">
                  <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="p-1 hover:bg-surface rounded"
                  >
                    <Smile className="w-4 h-4 text-secondary" />
                  </button>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1 hover:bg-surface rounded"
                  >
                    <Paperclip className="w-4 h-4 text-secondary" />
                  </button>
                </div>
              </div>
              
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.rar"
              />
              
              {/* Emoji picker */}
              {showEmojiPicker && (
                <div className="absolute bottom-16 right-4 glass-panel rounded-lg p-3 grid grid-cols-5 gap-2 z-10">
                  {emojis.map((emoji, index) => (
                    <button
                      key={index}
                      onClick={() => addEmoji(emoji)}
                      className="p-2 hover:bg-surface rounded text-lg"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
              
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center space-x-2 text-xs text-secondary">
                  <AtSign className="w-3 h-3" />
                  <span>Use @username to mention users</span>
                  {mentions.length > 0 && (
                    <span className="text-yellow-500">
                      • Mentioning: {mentions.join(', ')}
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
              disabled={!messageInput.trim() && attachments.length === 0}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPanel;
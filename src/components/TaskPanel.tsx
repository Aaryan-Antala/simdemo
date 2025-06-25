import React, { useState } from 'react';
import { CheckSquare, Clock, User, Plus, Filter, Calendar, Trash2, Edit, Bot, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { supabase, type Task } from '../lib/supabase';
import GlassCard from './ui/GlassCard';
import Button from './ui/Button';

interface TaskPanelProps {
  tasks: Task[];
  onTaskUpdate: () => void;
}

const TaskPanel: React.FC<TaskPanelProps> = ({ tasks, onTaskUpdate }) => {
  const { user } = useAuth();
  const [filter, setFilter] = useState<'all' | 'assigned' | 'created'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'todo' | 'in_progress' | 'completed'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showAIHelpModal, setShowAIHelpModal] = useState(false);
  const [selectedTaskForAI, setSelectedTaskForAI] = useState<Task | null>(null);
  const [aiHelpQuery, setAiHelpQuery] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
    due_date: ''
  });

  const filteredTasks = tasks.filter(task => {
    // Filter by ownership
    if (filter === 'assigned') {
      const isAssigned = task.assignments?.some(a => a.user_id === user?.id);
      if (!isAssigned) return false;
    } else if (filter === 'created') {
      if (task.created_by !== user?.id) return false;
    }

    // Filter by status
    if (statusFilter !== 'all' && task.status !== statusFilter) {
      return false;
    }

    return true;
  });

  const handleCreateTask = async () => {
    if (!newTask.title.trim() || !user) return;

    try {
      const { error } = await supabase
        .from('tasks')
        .insert({
          title: newTask.title,
          description: newTask.description || null,
          priority: newTask.priority,
          due_date: newTask.due_date || null,
          created_by: user.id
        });

      if (error) {
        console.error('Error creating task:', error);
        return;
      }

      setNewTask({ title: '', description: '', priority: 'medium', due_date: '' });
      setShowCreateModal(false);
      onTaskUpdate();
    } catch (error) {
      console.error('Error creating task:', error);
    }
  };

  const handleUpdateTask = async () => {
    if (!editingTask || !newTask.title.trim()) return;

    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          title: newTask.title,
          description: newTask.description || null,
          priority: newTask.priority,
          due_date: newTask.due_date || null
        })
        .eq('id', editingTask.id);

      if (error) {
        console.error('Error updating task:', error);
        return;
      }

      setEditingTask(null);
      setNewTask({ title: '', description: '', priority: 'medium', due_date: '' });
      setShowCreateModal(false);
      onTaskUpdate();
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      const response = await fetch(`http://localhost:8002/api/workspace/tasks/${taskId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          userId: user?.id
        })
      });

      const data = await response.json();
      
      if (data.success) {
        onTaskUpdate();
      } else {
        console.error('Error deleting task:', data.error);
        alert(data.error);
      }
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setNewTask({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      due_date: task.due_date ? task.due_date.split('T')[0] : ''
    });
    setShowCreateModal(true);
  };

  const handleAIHelp = (task: Task) => {
    setSelectedTaskForAI(task);
    setAiHelpQuery(`Help me with this task: ${task.title}${task.description ? ` - ${task.description}` : ''}`);
    setAiResponse('');
    setShowAIHelpModal(true);
  };

  const handleAIHelpSubmit = async () => {
    if (!aiHelpQuery.trim()) return;

    setIsLoadingAI(true);
    try {
      const response = await fetch('http://localhost:8001/api/chat/general', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          message: aiHelpQuery,
          userId: user?.id
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setAiResponse(data.response);
      } else {
        setAiResponse('Sorry, I encountered an error while processing your request.');
      }
    } catch (error) {
      console.error('Error getting AI help:', error);
      setAiResponse('Sorry, I encountered an error while processing your request.');
    } finally {
      setIsLoadingAI(false);
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, status: Task['status']) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ status })
        .eq('id', taskId);

      if (error) {
        console.error('Error updating task:', error);
        return;
      }

      onTaskUpdate();
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'text-red-500 bg-red-500/10 border-red-500/30';
      case 'high': return 'text-orange-500 bg-orange-500/10 border-orange-500/30';
      case 'medium': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30';
      case 'low': return 'text-green-500 bg-green-500/10 border-green-500/30';
      default: return 'text-gray-500 bg-gray-500/10 border-gray-500/30';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-500';
      case 'in_progress': return 'text-blue-500';
      case 'cancelled': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const canEditTask = (task: Task) => {
    return task.created_by === user?.id;
  };

  const handleModalClose = () => {
    setShowCreateModal(false);
    setEditingTask(null);
    setNewTask({ title: '', description: '', priority: 'medium', due_date: '' });
  };

  return (
    <>
      <div className="flex-1 flex flex-col h-full">
        {/* Header - Fixed */}
        <div className="glass-panel border-b silver-border p-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold gradient-gold-silver">Tasks</h2>
            <Button
              onClick={() => setShowCreateModal(true)}
              variant="premium"
              size="sm"
              className="flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>New Task</span>
            </Button>
          </div>

          {/* Filters - Part of fixed header */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-secondary" />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
                className="glass-panel rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-yellow-500"
              >
                <option value="all">All Tasks</option>
                <option value="assigned">Assigned to Me</option>
                <option value="created">Created by Me</option>
              </select>
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="glass-panel rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-yellow-500"
            >
              <option value="all">All Status</option>
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        {/* Tasks List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <AnimatePresence>
            {filteredTasks.map((task) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <GlassCard className="p-4 group" hover>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <button
                          onClick={() => handleUpdateTaskStatus(
                            task.id, 
                            task.status === 'completed' ? 'todo' : 'completed'
                          )}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                            task.status === 'completed'
                              ? 'bg-green-500 border-green-500'
                              : 'border-gray-400 hover:border-green-500'
                          }`}
                        >
                          {task.status === 'completed' && (
                            <CheckSquare className="w-3 h-3 text-white" />
                          )}
                        </button>
                        
                        <h3 className={`font-semibold ${
                          task.status === 'completed' 
                            ? 'text-secondary line-through' 
                            : 'text-primary'
                        }`}>
                          {task.title}
                        </h3>

                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(task.priority)}`}>
                          {task.priority}
                        </span>
                      </div>

                      {task.description && (
                        <p className="text-secondary text-sm mb-3">{task.description}</p>
                      )}

                      <div className="flex items-center space-x-4 text-xs text-secondary">
                        <div className="flex items-center space-x-1">
                          <span className={`w-2 h-2 rounded-full ${getStatusColor(task.status)}`} />
                          <span className="capitalize">{task.status.replace('_', ' ')}</span>
                        </div>

                        {task.due_date && (
                          <div className="flex items-center space-x-1">
                            <Calendar className="w-3 h-3" />
                            <span>{formatDate(task.due_date)}</span>
                          </div>
                        )}

                        {task.assignments && task.assignments.length > 0 && (
                          <div className="flex items-center space-x-1">
                            <User className="w-3 h-3" />
                            <span>{task.assignments.length} assigned</span>
                          </div>
                        )}

                        <div className="flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>{formatDate(task.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <select
                        value={task.status}
                        onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value as Task['status'])}
                        className="glass-panel rounded-lg px-2 py-1 text-xs text-primary focus:outline-none focus:ring-1 focus:ring-yellow-500"
                      >
                        <option value="todo">To Do</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>

                      {/* Task Actions */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1">
                        <Button
                          onClick={() => handleAIHelp(task)}
                          variant="ghost"
                          size="sm"
                          className="p-1"
                          title="AI Help"
                        >
                          <Bot className="w-3 h-3 text-blue-500" />
                        </Button>
                        {canEditTask(task) && (
                          <>
                            <Button
                              onClick={() => handleEditTask(task)}
                              variant="ghost"
                              size="sm"
                              className="p-1"
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button
                              onClick={() => handleDeleteTask(task.id)}
                              variant="ghost"
                              size="sm"
                              className="p-1 text-red-400 hover:text-red-300"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </AnimatePresence>

          {filteredTasks.length === 0 && (
            <div className="text-center py-12">
              <CheckSquare className="w-12 h-12 text-secondary mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-bold text-primary mb-2">No tasks found</h3>
              <p className="text-secondary mb-4">
                {filter === 'all' 
                  ? 'Create your first task or mention someone in chat to auto-create tasks'
                  : `No tasks ${filter === 'assigned' ? 'assigned to you' : 'created by you'}`
                }
              </p>
              <Button
                onClick={() => setShowCreateModal(true)}
                variant="secondary"
                size="sm"
              >
                Create Task
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Task Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md"
            >
              <GlassCard className="p-6" goldBorder>
                <h3 className="text-xl font-bold gradient-gold-silver mb-6">
                  {editingTask ? 'Edit Task' : 'Create New Task'}
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-primary mb-2">
                      Task Title
                    </label>
                    <input
                      type="text"
                      value={newTask.title}
                      onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="What needs to be done?"
                      className="w-full glass-panel rounded-lg px-4 py-3 text-primary placeholder-secondary focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-primary mb-2">
                      Description (Optional)
                    </label>
                    <textarea
                      value={newTask.description}
                      onChange={(e) => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Add more details..."
                      className="w-full glass-panel rounded-lg px-4 py-3 text-primary placeholder-secondary focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-none"
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-primary mb-2">
                        Priority
                      </label>
                      <select
                        value={newTask.priority}
                        onChange={(e) => setNewTask(prev => ({ ...prev, priority: e.target.value as any }))}
                        className="w-full glass-panel rounded-lg px-4 py-3 text-primary focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-primary mb-2">
                        Due Date (Optional)
                      </label>
                      <input
                        type="date"
                        value={newTask.due_date}
                        onChange={(e) => setNewTask(prev => ({ ...prev, due_date: e.target.value }))}
                        className="w-full glass-panel rounded-lg px-4 py-3 text-primary focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex space-x-4 mt-6">
                  <Button
                    onClick={handleModalClose}
                    variant="secondary"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={editingTask ? handleUpdateTask : handleCreateTask}
                    variant="premium"
                    className="flex-1"
                    disabled={!newTask.title.trim()}
                  >
                    {editingTask ? 'Update Task' : 'Create Task'}
                  </Button>
                </div>
              </GlassCard>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Help Modal */}
      <AnimatePresence>
        {showAIHelpModal && selectedTaskForAI && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-2xl"
            >
              <GlassCard className="p-6" goldBorder>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold gradient-gold-silver flex items-center">
                    <Bot className="w-5 h-5 mr-2" />
                    AI Task Assistant
                  </h3>
                  <button
                    onClick={() => setShowAIHelpModal(false)}
                    className="text-secondary hover:text-primary"
                  >
                    ×
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div className="p-3 glass-panel rounded-lg bg-blue-500/10 border-blue-500/30">
                    <h4 className="font-medium text-blue-400 mb-1">Task: {selectedTaskForAI.title}</h4>
                    {selectedTaskForAI.description && (
                      <p className="text-sm text-secondary">{selectedTaskForAI.description}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-primary mb-2">
                      Ask AI for help with this task
                    </label>
                    <textarea
                      value={aiHelpQuery}
                      onChange={(e) => setAiHelpQuery(e.target.value)}
                      placeholder="How can I help you with this task? Ask for suggestions, steps, resources, etc."
                      className="w-full glass-panel rounded-lg px-4 py-3 text-primary placeholder-secondary focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-none"
                      rows={3}
                    />
                  </div>

                  {aiResponse && (
                    <div className="p-4 glass-panel rounded-lg bg-green-500/10 border-green-500/30">
                      <h4 className="font-medium text-green-400 mb-2 flex items-center">
                        <Bot className="w-4 h-4 mr-2" />
                        AI Response
                      </h4>
                      <div className="text-sm text-secondary whitespace-pre-wrap">
                        {aiResponse}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex space-x-4 mt-6">
                  <Button
                    onClick={() => setShowAIHelpModal(false)}
                    variant="secondary"
                    className="flex-1"
                  >
                    Close
                  </Button>
                  <Button
                    onClick={handleAIHelpSubmit}
                    variant="premium"
                    className="flex-1"
                    disabled={!aiHelpQuery.trim() || isLoadingAI}
                  >
                    {isLoadingAI ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Bot className="w-4 h-4 mr-2" />
                    )}
                    {isLoadingAI ? 'Getting Help...' : 'Get AI Help'}
                  </Button>
                </div>
              </GlassCard>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default TaskPanel;
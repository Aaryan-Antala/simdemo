import React, { useState, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock, CheckSquare } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { supabase, type Task, type CalendarEvent } from '../lib/supabase';
import GlassCard from './ui/GlassCard';
import Button from './ui/Button';

interface CalendarPanelProps {
  tasks: Task[];
}

const CalendarPanel: React.FC<CalendarPanelProps> = ({ tasks }) => {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');

  useEffect(() => {
    loadEvents();
  }, [user, currentDate]);

  const loadEvents = async () => {
    if (!user) return;

    try {
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('user_id', user.id)
        .gte('start_time', startOfMonth.toISOString())
        .lte('start_time', endOfMonth.toISOString())
        .order('start_time');

      if (error) {
        console.error('Error loading events:', error);
        return;
      }

      setEvents(data || []);
    } catch (error) {
      console.error('Error loading events:', error);
    }
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    
    return days;
  };

  const getTasksForDate = (date: Date) => {
    // Fix: Use local date comparison to avoid timezone issues
    const localDateString = date.getFullYear() + '-' + 
      String(date.getMonth() + 1).padStart(2, '0') + '-' + 
      String(date.getDate()).padStart(2, '0');
    
    return tasks.filter(task => {
      if (!task.due_date) return false;
      
      // Extract date part from due_date (YYYY-MM-DD)
      const taskDateString = task.due_date.split('T')[0];
      return taskDateString === localDateString;
    });
  };

  const getEventsForDate = (date: Date) => {
    // Fix: Use local date comparison to avoid timezone issues
    const localDateString = date.getFullYear() + '-' + 
      String(date.getMonth() + 1).padStart(2, '0') + '-' + 
      String(date.getDate()).padStart(2, '0');
    
    return events.filter(event => {
      // Extract date part from start_time (YYYY-MM-DD)
      const eventDateString = event.start_time.split('T')[0];
      return eventDateString === localDateString;
    });
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString([], { month: 'long', year: 'numeric' });
  };

  const formatDateForDisplay = (dateString: string) => {
    // Parse the date string and format for display
    const date = new Date(dateString);
    return date.toLocaleDateString([], { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const days = getDaysInMonth(currentDate);
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header - Fixed */}
      <div className="glass-panel border-b silver-border p-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold gradient-gold-silver">Calendar</h2>
          
          <div className="flex items-center space-x-4">
            {/* View Toggle */}
            <div className="flex items-center space-x-1 glass-panel rounded-lg p-1">
              {(['month', 'week', 'day'] as const).map((viewType) => (
                <button
                  key={viewType}
                  onClick={() => setView(viewType)}
                  className={`px-3 py-1 rounded-md text-sm transition-all capitalize ${
                    view === viewType
                      ? 'bg-gradient-gold-silver text-white'
                      : 'text-secondary hover:text-primary'
                  }`}
                >
                  {viewType}
                </button>
              ))}
            </div>

            {/* Navigation */}
            <div className="flex items-center space-x-2">
              <Button
                onClick={() => navigateMonth('prev')}
                variant="ghost"
                size="sm"
                className="p-2"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              
              <h3 className="text-lg font-semibold text-primary min-w-[200px] text-center">
                {formatMonthYear(currentDate)}
              </h3>
              
              <Button
                onClick={() => navigateMonth('next')}
                variant="ghost"
                size="sm"
                className="p-2"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            <Button
              onClick={() => setCurrentDate(new Date())}
              variant="secondary"
              size="sm"
            >
              Today
            </Button>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {view === 'month' && (
          <div className="grid grid-cols-7 gap-1 h-full">
            {/* Week day headers */}
            {weekDays.map((day) => (
              <div
                key={day}
                className="p-3 text-center text-sm font-semibold text-secondary border-b silver-border"
              >
                {day}
              </div>
            ))}

            {/* Calendar days */}
            {days.map((date, index) => {
              if (!date) {
                return <div key={index} className="p-2" />;
              }

              const dayTasks = getTasksForDate(date);
              const dayEvents = getEventsForDate(date);
              const isCurrentDay = isToday(date);

              return (
                <motion.div
                  key={date.toISOString()}
                  className={`p-2 min-h-[120px] glass-panel rounded-lg border transition-all hover:border-gold-border ${
                    isCurrentDay ? 'border-gold-border bg-gradient-gold-silver/10' : ''
                  }`}
                  whileHover={{ scale: 1.02 }}
                >
                  <div className={`text-sm font-semibold mb-2 ${
                    isCurrentDay ? 'text-primary' : 'text-secondary'
                  }`}>
                    {date.getDate()}
                  </div>

                  <div className="space-y-1">
                    {/* Tasks */}
                    {dayTasks.slice(0, 2).map((task) => (
                      <div
                        key={task.id}
                        className="p-1 rounded text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 truncate"
                        title={`Task: ${task.title} (Due: ${formatDateForDisplay(task.due_date!)})`}
                      >
                        <CheckSquare className="w-3 h-3 inline mr-1" />
                        {task.title}
                      </div>
                    ))}

                    {/* Events */}
                    {dayEvents.slice(0, 2).map((event) => (
                      <div
                        key={event.id}
                        className="p-1 rounded text-xs bg-green-500/20 text-green-400 border border-green-500/30 truncate"
                        title={`Event: ${event.title}`}
                      >
                        <Clock className="w-3 h-3 inline mr-1" />
                        {event.title}
                      </div>
                    ))}

                    {/* Show more indicator */}
                    {(dayTasks.length + dayEvents.length) > 2 && (
                      <div className="text-xs text-secondary">
                        +{(dayTasks.length + dayEvents.length) - 2} more
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Week and Day views would go here */}
        {view !== 'month' && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Calendar className="w-16 h-16 text-secondary mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-bold text-primary mb-2">
                {view === 'week' ? 'Week' : 'Day'} View
              </h3>
              <p className="text-secondary">Coming soon...</p>
            </div>
          </div>
        )}
      </div>

      {/* Upcoming Tasks Sidebar */}
      <div className="w-80 glass-panel border-l silver-border p-4">
        <h3 className="font-bold text-primary mb-4">Upcoming Tasks</h3>
        
        <div className="space-y-3">
          {tasks
            .filter(task => task.due_date && task.status !== 'completed')
            .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
            .slice(0, 5)
            .map((task) => (
              <GlassCard key={task.id} className="p-3" hover>
                <div className="flex items-start space-x-3">
                  <CheckSquare className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-primary truncate">{task.title}</h4>
                    <p className="text-xs text-secondary">
                      Due: {formatDateForDisplay(task.due_date!)}
                    </p>
                  </div>
                </div>
              </GlassCard>
            ))}

          {tasks.filter(task => task.due_date && task.status !== 'completed').length === 0 && (
            <div className="text-center py-8">
              <CheckSquare className="w-8 h-8 text-secondary mx-auto mb-2 opacity-50" />
              <p className="text-secondary text-sm">No upcoming tasks</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CalendarPanel;
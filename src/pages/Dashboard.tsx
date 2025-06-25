import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Gamepad2, Video, LogOut, Settings, User, Users, MessageSquare } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import GlassCard from '../components/ui/GlassCard';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, signOut, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/');
    }
  }, [user, loading, navigate]);

  const features = [
    {
      id: 'workspace',
      icon: Users,
      title: 'Workspace',
      description: 'Collaborative chat with AI task detection, calendar integration, and intelligent project management.',
      route: '/workspace',
      color: 'from-purple-500 to-blue-500',
    },
    {
      id: 'assistant',
      icon: Bot,
      title: 'AI Assistant',
      description: 'Professional productivity support with Gmail management and intelligent assistance for your daily workflow.',
      route: '/assistant',
      color: 'from-blue-500 to-cyan-500',
    },
    {
      id: 'meetings',
      icon: Video,
      title: 'Video Meetings',
      description: 'Smart video conferencing with AI-powered transcription, note-taking, and meeting summaries.',
      route: '/meetings',
      color: 'from-cyan-500 to-green-500',
    },
    {
      id: 'game-mode',
      icon: Gamepad2,
      title: 'Interactive Games',
      description: 'Engaging mental exercises, problem-solving games, and intelligent entertainment for cognitive enhancement.',
      route: '/game-mode',
      color: 'from-green-500 to-yellow-500',
    },
  ];

  const handleFeatureClick = (route: string) => {
    navigate(route);
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="glass-panel rounded-2xl p-8 max-w-md mx-auto text-center">
          <div className="animate-spin w-8 h-8 border-2 border-gold-text border-t-transparent rounded-full mx-auto mb-4"></div>
          <h3 className="text-xl font-bold text-primary mb-2">Loading Dashboard...</h3>
          <p className="text-secondary">Setting up your workspace</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-primary">
      {/* Header */}
      <header className="glass-panel border-0 border-b silver-border">
        <div className="max-w-7xl mx-auto container-padding">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-full bg-gradient-gold-silver flex items-center justify-center">
                <User className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold gradient-gold-silver">
                  Welcome, {user.full_name || user.username}
                </h2>
                <p className="text-sm text-secondary">
                  Select your preferred mode
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              <button className="glass-panel p-3 rounded-lg glass-panel-hover">
                <Settings className="w-5 h-5 text-secondary" />
              </button>
              <button
                onClick={handleLogout}
                className="glass-panel p-3 rounded-lg glass-panel-hover"
              >
                <LogOut className="w-5 h-5 text-secondary" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="section-spacing container-padding">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-bold gradient-gold-silver mb-6">
              Your Professional Dashboard
            </h1>
            <p className="text-lg text-secondary max-w-2xl mx-auto">
              Choose from specialized AI modes, each designed to excel in specific professional domains.
            </p>
          </div>

          {/* Feature Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto mb-16">
            {features.map((feature) => (
              <GlassCard
                key={feature.id}
                className="p-8 cursor-pointer group"
                hover
                goldBorder
                onClick={() => handleFeatureClick(feature.route)}
              >
                <div className="text-center">
                  <div className={`w-16 h-16 rounded-lg bg-gradient-to-r ${feature.color} flex items-center justify-center mx-auto mb-6`}>
                    <feature.icon className="w-8 h-8 text-white" />
                  </div>
                  
                  <h3 className="text-xl font-bold text-primary mb-4 group-hover:gold-text transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-secondary leading-relaxed mb-6 text-sm">
                    {feature.description}
                  </p>
                  <div className="flex items-center justify-center gradient-gold-silver font-semibold text-sm">
                    <span>Access {feature.title}</span>
                    <svg className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
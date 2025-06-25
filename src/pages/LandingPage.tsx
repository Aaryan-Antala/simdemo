import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Gamepad2, Sparkles, ArrowRight, Users, Shield, Zap, LogOut, Video, MessageSquare, CheckSquare, Calendar, Mail, Brain, Mic, FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import AuthModal from '../components/AuthModal';
import GlassCard from '../components/ui/GlassCard';
import Button from '../components/ui/Button';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, signOut } = useAuth();
  const [authModal, setAuthModal] = useState<{ isOpen: boolean; mode: 'signin' | 'signup' }>({
    isOpen: false,
    mode: 'signin'
  });

  const mainFeatures = [
    {
      icon: Users,
      title: 'Workspace',
      description: 'Collaborate seamlessly with AI-powered chat, automatic task detection, calendar integration, and intelligent project management tools.',
      color: 'from-purple-500 to-blue-500',
      highlights: ['AI Task Detection', 'Real-time Chat', 'Calendar Integration', 'Project Management']
    },
    {
      icon: Bot,
      title: 'AI Assistant',
      description: 'Your intelligent co-pilot for daily productivity with Gmail management, document generation, and smart insights for professional workflows.',
      color: 'from-blue-500 to-cyan-500',
      highlights: ['Gmail Integration', 'Document Generation', 'Smart Insights', 'Productivity Tools']
    },
    {
      icon: Video,
      title: 'Video Meetings',
      description: 'Host smart video conferences with live transcription, AI-powered note-taking, automatic summaries, and seamless collaboration.',
      color: 'from-cyan-500 to-green-500',
      highlights: ['Live Transcription', 'AI Notes', 'Meeting Summaries', 'HD Video Quality']
    },
    {
      icon: Gamepad2,
      title: 'Interactive Games',
      description: 'Engage your mind with AI-powered riddles, classic guessing games, and intelligent entertainment for cognitive enhancement.',
      color: 'from-green-500 to-yellow-500',
      highlights: ['AI Riddles', '20 Questions', 'Mind Games', 'Cognitive Training']
    },
  ];

  const additionalFeatures = [
    {
      icon: MessageSquare,
      title: 'Smart Chat',
      description: 'AI-enhanced messaging with automatic task creation from conversations',
    },
    {
      icon: CheckSquare,
      title: 'Task Management',
      description: 'Intelligent task tracking with AI-powered priority suggestions',
    },
    {
      icon: Calendar,
      title: 'Calendar Integration',
      description: 'Seamless scheduling with smart meeting coordination',
    },
    {
      icon: Mail,
      title: 'Gmail Management',
      description: 'Professional email handling with AI-powered organization',
    },
    {
      icon: Brain,
      title: 'AI Processing',
      description: 'Advanced natural language understanding for all interactions',
    },
    {
      icon: FileText,
      title: 'Document Generation',
      description: 'Create professional documents with AI assistance',
    },
  ];

  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigate('/dashboard');
    } else {
      setAuthModal({ isOpen: true, mode: 'signup' });
    }
  };

  const handleSignIn = () => {
    if (isAuthenticated) {
      navigate('/dashboard');
    } else {
      setAuthModal({ isOpen: true, mode: 'signin' });
    }
  };
  
  const handleLogout = async () => {
    await signOut();
    // After logout, stay on the landing page
  };

  return (
    <div className="min-h-screen bg-primary">
      {/* Header */}
      <header className="fixed top-0 w-full z-40 glass-panel border-0 border-b silver-border">
        <div className="max-w-7xl mx-auto container-padding">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <Sparkles className="w-7 h-7 gold-text" />
              <h1 className="text-2xl font-bold gradient-gold-silver">SimAlly</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              {isAuthenticated ? (
                <>
                  <Button
                    onClick={() => navigate('/dashboard')}
                    variant="secondary"
                    size="sm"
                  >
                    Dashboard
                  </Button>
                  <Button
                    onClick={handleLogout}
                    variant="secondary"
                    size="sm"
                    className="flex items-center space-x-2"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={handleSignIn}
                    variant="secondary"
                    size="sm"
                  >
                    Sign In
                  </Button>
                  <Button
                    onClick={handleGetStarted}
                    variant="premium"
                    size="sm"
                  >
                    Get Started
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 container-padding">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-5xl mx-auto">
            <h1 className="text-5xl md:text-6xl lg:text-8xl font-bold mb-6 gradient-gold-silver">
              SimAlly
            </h1>
            
            <h1 className="text-5xl md:text-6xl lg:text-5xl font-bold mb-6 gradient-gold-silver">
              The Future of AI Productivity
            </h1>
            
            
            
            <p className="text-lg gold-text font-medium mb-6">
              Transform your workflow with AI that understands, assists, and elevates every interaction.
            </p>
            
            <p className="text-base text-secondary max-w-3xl mx-auto mb-12 leading-relaxed">
              SimAlly combines advanced AI assistance, collaborative workspaces, intelligent video meetings, 
              and engaging interactive experiences into one seamless platform. From managing your Gmail and 
              generating documents to hosting AI-transcribed meetings and playing mind-enhancing games, 
              SimAlly is your complete digital companion for professional and personal growth.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
              <Button
                onClick={handleGetStarted}
                variant="premium"
                size="lg"
                className="inline-flex items-center space-x-2"
              >
                <span>{isAuthenticated ? 'Access Dashboard' : 'Start Your Journey'}</span>
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Features Section */}
      <section className="section-spacing container-padding">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold gradient-gold-silver mb-6">
              Four Powerful Modes, Infinite Possibilities
            </h2>
            <p className="text-lg text-secondary max-w-3xl mx-auto">
              Each mode is meticulously designed to excel in specific domains, providing you with 
              specialized AI assistance tailored to your unique needs.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto mb-16">
            {mainFeatures.map((feature, index) => (
              <GlassCard key={index} className="p-8 h-full" hover goldBorder>
                <div className="flex flex-col h-full">
                  <div className="flex items-start space-x-6 mb-6">
                    <div className={`w-16 h-16 rounded-xl bg-gradient-to-r ${feature.color} flex items-center justify-center flex-shrink-0`}>
                      <feature.icon className="w-8 h-8 text-white" />
                    </div>
                    
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold text-primary mb-3">
                        {feature.title}
                      </h3>
                      <p className="text-secondary leading-relaxed mb-4">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 mt-auto">
                    {feature.highlights.map((highlight, idx) => (
                      <div key={idx} className="flex items-center space-x-2 text-sm">
                        <div className="w-2 h-2 rounded-full bg-gradient-gold-silver"></div>
                        <span className="text-primary font-medium">{highlight}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>

      {/* Additional Features Grid */}
      <section className="section-spacing container-padding">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold gradient-gold-silver mb-6">
              Comprehensive Feature Set
            </h2>
            <p className="text-lg text-secondary max-w-2xl mx-auto">
              Every feature is designed to work seamlessly together, creating a unified experience 
              that adapts to your workflow.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {additionalFeatures.map((feature, index) => (
              <GlassCard key={index} className="p-6 text-center" hover>
                <feature.icon className="w-10 h-10 gold-text mx-auto mb-4" />
                <h3 className="text-lg font-bold text-primary mb-3">
                  {feature.title}
                </h3>
                <p className="text-secondary text-sm leading-relaxed">
                  {feature.description}
                </p>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="section-spacing container-padding">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 max-w-5xl mx-auto">
            {[
              { icon: Users, label: 'Active Users', value: '10,000+', color: 'gold-text' },
              { icon: Mic, label: 'Meeting Minutes Transcribed', value: '500K+', color: 'silver-text' },
              { icon: Shield, label: 'Data Security', value: '100%', color: 'gold-text' },
              { icon: Zap, label: 'AI Response Time', value: '<1s', color: 'silver-text' },
            ].map((stat, index) => (
              <GlassCard key={index} className="p-6 text-center" hover>
                <stat.icon className={`w-8 h-8 ${stat.color} mx-auto mb-4`} />
                <div className="text-2xl font-bold gradient-gold-silver mb-2">
                  {stat.value}
                </div>
                <div className="text-secondary font-medium text-sm">
                  {stat.label}
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>

      {/* Technology Highlights */}
      <section className="section-spacing container-padding">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold gradient-gold-silver mb-6">
              Built with Cutting-Edge Technology
            </h2>
            <p className="text-lg text-secondary max-w-2xl mx-auto">
              Powered by advanced AI models and modern web technologies for unparalleled performance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              {
                title: 'Advanced AI Models',
                description: 'Powered by state-of-the-art language models for intelligent assistance',
                icon: Brain,
                color: 'from-purple-500 to-blue-500'
              },
              {
                title: 'Real-time Collaboration',
                description: 'Instant synchronization across all devices and team members',
                icon: Zap,
                color: 'from-blue-500 to-cyan-500'
              },
              {
                title: 'Enterprise Security',
                description: 'Bank-level encryption and privacy protection for all your data',
                icon: Shield,
                color: 'from-cyan-500 to-green-500'
              }
            ].map((tech, index) => (
              <GlassCard key={index} className="p-8 text-center" hover>
                <div className={`w-16 h-16 rounded-xl bg-gradient-to-r ${tech.color} flex items-center justify-center mx-auto mb-6`}>
                  <tech.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-primary mb-4">{tech.title}</h3>
                <p className="text-secondary leading-relaxed">{tech.description}</p>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="section-spacing container-padding">
        <div className="max-w-4xl mx-auto text-center">
          <GlassCard className="p-12" goldBorder>
            <h2 className="text-3xl md:text-4xl font-bold gradient-gold-silver mb-6">
              Ready to Transform Your Workflow?
            </h2>
            <p className="text-lg text-secondary mb-8 max-w-2xl mx-auto">
              Join thousands of professionals who have revolutionized their productivity and collaboration 
              with SimAlly's intelligent platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button
                onClick={handleGetStarted}
                variant="premium"
                size="lg"
                className="flex items-center space-x-2"
              >
                <span>{isAuthenticated ? 'Access Dashboard' : 'Start Free Today'}</span>
                <ArrowRight className="w-5 h-5" />
              </Button>
              <p className="text-sm text-secondary">
                No setup fees • Cancel anytime • Full feature access
              </p>
            </div>
          </GlassCard>
        </div>
      </section>

      <AuthModal
        isOpen={authModal.isOpen}
        onClose={() => setAuthModal({ ...authModal, isOpen: false })}
        mode={authModal.mode}
        onModeChange={(mode) => setAuthModal({ ...authModal, mode })}
      />
    </div>
  );
};

export default LandingPage;
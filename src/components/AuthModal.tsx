import React, { useState } from 'react';
import { X, Lock, User, Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import GlassCard from './ui/GlassCard';
import Button from './ui/Button';
const VITE_AI_API_URL = import.meta.env.VITE_AI_API_URL;
const VITE_API_URL = import.meta.env.VITE_API_URL;
const VITE_MEDIA_API_URL = import.meta.env.VITE_MEDIA_API_URL;
const VITE_WORKSPACE_API_URL = import.meta.env.VITE_WORKSPACE_API_URL;
const VITE_APP_URL = import.meta.env.VITE_APP_URL;
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL;

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'signin' | 'signup';
  onModeChange: (mode: 'signin' | 'signup') => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, mode, onModeChange }) => {
  const { signIn, signUp } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    fullName: '',
    password: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      let result;
      if (mode === 'signin') {
        result = await signIn(formData.username, formData.password);
      } else {
        if (!formData.fullName.trim()) {
          setError('Full name is required');
          setIsLoading(false);
          return;
        }
        result = await signUp(formData.username, formData.password, formData.fullName);
      }

      if (result.error) {
        setError(result.error);
      } else {
        onClose();
        setFormData({ username: '', fullName: '', password: '' });
        setError('');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
    // Clear error when user starts typing
    if (error) setError('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md">
        <GlassCard className="p-8" goldBorder>
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-bold gradient-gold-silver">
              {mode === 'signin' ? 'Welcome Back' : 'Join SimAlly'}
            </h2>
            <button
              onClick={onClose}
              className="text-secondary hover:text-primary p-1 rounded-lg glass-panel glass-panel-hover"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-primary mb-2">
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-5 h-5 text-secondary" />
                <input
                  type="text"
                  name="username"
                  placeholder="Enter your username"
                  value={formData.username}
                  onChange={handleInputChange}
                  className="w-full pl-10 pr-4 py-3 glass-panel rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 text-primary placeholder-secondary"
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-primary mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3 w-5 h-5 text-secondary" />
                  <input
                    type="text"
                    name="fullName"
                    placeholder="Enter your full name"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-4 py-3 glass-panel rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 text-primary placeholder-secondary"
                    required
                    autoComplete="name"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-primary mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-secondary" />
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="w-full pl-10 pr-12 py-3 glass-panel rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 text-primary placeholder-secondary"
                  required
                  minLength={6}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-secondary hover:text-primary"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {mode === 'signup' && (
                <p className="text-xs text-secondary mt-1">
                  Password must be at least 6 characters long
                </p>
              )}
            </div>

            {error && (
              <div className="flex items-center space-x-2 p-3 glass-panel rounded-lg bg-red-500/10 border-red-500/30">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {mode === 'signup' && (
              <div className="p-3 glass-panel rounded-lg bg-green-500/10 border-green-500/30">
                <p className="text-green-400 text-sm">
                  ✓ Create your account instantly - no email verification required!
                </p>
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full"
              variant="premium"
              size="lg"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : (
                mode === 'signin' ? 'Sign In' : 'Create Account'
              )}
            </Button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-secondary">
              {mode === 'signin' ? "Don't have an account?" : "Already have an account?"}
              <button
                onClick={() => onModeChange(mode === 'signin' ? 'signup' : 'signin')}
                className="ml-2 gradient-gold-silver hover:underline font-semibold"
                disabled={isLoading}
              >
                {mode === 'signin' ? 'Sign Up' : 'Sign In'}
              </button>
            </p>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

export default AuthModal;
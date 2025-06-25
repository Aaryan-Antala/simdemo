import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService, type User, type Session } from '../lib/auth';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
  signUp: (username: string, password: string, fullName: string) => Promise<{ error?: string }>;
  signIn: (username: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen for auth state changes
    const unsubscribe = authService.onAuthStateChange((session) => {
      setSession(session);
      setUser(session?.user || null);
      setLoading(false);
    });

    // Verify current session on mount
    authService.verifySession().finally(() => {
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signUp = async (username: string, password: string, fullName: string) => {
    return authService.signUp(username, password, fullName);
  };

  const signIn = async (username: string, password: string) => {
    return authService.signIn(username, password);
  };

  const signOut = async () => {
    await authService.signOut();
  };

  const isAuthenticated = authService.isAuthenticated();

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      isAuthenticated,
      signUp,
      signIn,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
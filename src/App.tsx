import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import AssistantPage from './pages/AssistantPage';
import GameModePage from './pages/GameModePage';
import MeetingPage from './pages/MeetingPage';
import WorkspacePage from './pages/WorkspacePage';
import ProtectedRoute from './components/ProtectedRoute';
const VITE_AI_API_URL = import.meta.env.VITE_AI_API_URL;
const VITE_API_URL = import.meta.env.VITE_API_URL;
const VITE_MEDIA_API_URL = import.meta.env.VITE_MEDIA_API_URL;
const VITE_WORKSPACE_API_URL = import.meta.env.VITE_WORKSPACE_API_URL;
const VITE_APP_URL = import.meta.env.VITE_APP_URL;
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL;

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <div className="min-h-screen transition-colors duration-500 bg-primary">
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } />
              <Route path="/assistant" element={
                <ProtectedRoute>
                  <AssistantPage />
                </ProtectedRoute>
              } />
              <Route path="/game-mode" element={
                <ProtectedRoute>
                  <GameModePage />
                </ProtectedRoute>
              } />
              <Route path="/meetings" element={
                <ProtectedRoute>
                  <MeetingPage />
                </ProtectedRoute>
              } />
              <Route path="/workspace" element={
                <ProtectedRoute>
                  <WorkspacePage />
                </ProtectedRoute>
              } />
            </Routes>
          </div>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
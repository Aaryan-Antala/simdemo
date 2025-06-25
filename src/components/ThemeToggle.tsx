import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const ThemeToggle: React.FC = () => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={
        isDark
          ? "glass-panel border-white rounded-lg p-2 glass-panel-hover transition-all duration-200"
          : "glass-panel border-black rounded-lg p-2 glass-panel-hover transition-all duration-200"
      }
    >
      {isDark ? (
        <Moon className="w-5 h-5 silver-text" />
      ) : (
        <Sun className="w-5 h-5 gold-text" />
      )}
    </button>
  );
};

export default ThemeToggle;
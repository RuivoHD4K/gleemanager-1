import React from 'react';
import './BaseLayout.css';
// Import the Menu and LogOut icons from Lucide React
import { Menu, LogOut } from 'lucide-react';

const Header = ({ toggleSidebar, isSidebarCollapsed, handleLogout }) => {
  // Get username from localStorage (or use email if username is not available)
  const username = localStorage.getItem("username") || 
                  localStorage.getItem("userEmail")?.split('@')[0] || 
                  "User";

  return (
    <header className="app-header">
      <div className="header-left">
        <button className="menu-toggle" onClick={toggleSidebar} aria-label="Toggle sidebar">
          <Menu size={24} strokeWidth={2} color="white"/>
        </button>
        <h2>GleeManager</h2>
      </div>
      
      <div className="header-right">
        <span className="welcome-text">Welcome, {username}</span>
        <button className="logout-btn" onClick={handleLogout} title="Logout">
          <LogOut size={20} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
};

export default Header;
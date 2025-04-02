import React from 'react';
import './BaseLayout.css';

const Header = ({ toggleSidebar, isSidebarCollapsed, handleLogout }) => {
  // Get username from localStorage (or use email if username is not available)
  const username = localStorage.getItem("username") || 
                  localStorage.getItem("userEmail")?.split('@')[0] || 
                  "User";

  return (
    <header className="app-header">
      <div className="header-left">
        <button className="menu-toggle" onClick={toggleSidebar}>
          <i className="menu-icon">≡</i>
        </button>
        <h2>GleeManager</h2>
      </div>
      
      <div className="user-info">
        <span className="welcome-text">Welcome, {username}</span>
        <button className="logout-icon-btn" onClick={handleLogout} title="Logout">
          <i className="logout-icon">⏻</i>
        </button>
      </div>
    </header>
  );
};

export default Header;
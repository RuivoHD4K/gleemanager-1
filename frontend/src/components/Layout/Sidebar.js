import React from 'react';
import { NavLink } from 'react-router-dom';
import './Sidebar.css';

const Sidebar = ({ userRole, isSidebarCollapsed }) => {
  return (
    <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
      <nav className="sidebar-nav">
        <NavLink to="/" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
          <span className="nav-icon">📊</span>
          <span className="nav-text">Dashboard</span>
        </NavLink>
        
        {userRole === 'admin' && (
          <>
            <NavLink to="/user-management" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-icon">👥</span>
              <span className="nav-text">User Management</span>
            </NavLink>
            
            <NavLink to="/settings" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-icon">⚙️</span>
              <span className="nav-text">System Settings</span>
            </NavLink>
          </>
        )}
        
        <NavLink to="/profile" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
          <span className="nav-icon">👤</span>
          <span className="nav-text">My Profile</span>
        </NavLink>
        
        <NavLink to="/help" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
          <span className="nav-icon">❓</span>
          <span className="nav-text">Help</span>
        </NavLink>
      </nav>
      
      <div className="sidebar-footer">
        <div className="app-version">
          <span className="nav-text">GleeManager v1.0</span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
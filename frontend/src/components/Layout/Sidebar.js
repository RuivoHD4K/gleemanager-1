import React from 'react';
import { NavLink } from 'react-router-dom';
import './Sidebar.css';
// Import appropriate icons from Lucide React
import { LayoutDashboard, Users, Settings, UserCircle, HelpCircle } from 'lucide-react';

const Sidebar = ({ userRole, isSidebarCollapsed }) => {
  // Set consistent icon size
  const iconSize = 22;
  
  return (
    <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
      <nav className="sidebar-nav">
        <NavLink to="/" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
          <span className="nav-icon">
            <LayoutDashboard size={iconSize} />
          </span>
          <span className="nav-text">Dashboard</span>
        </NavLink>
        
        {userRole === 'admin' && (
          <>
            <NavLink to="/user-management" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-icon">
                <Users size={iconSize} />
              </span>
              <span className="nav-text">User Management</span>
            </NavLink>
            
            <NavLink to="/settings" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-icon">
                <Settings size={iconSize} />
              </span>
              <span className="nav-text">System Settings</span>
            </NavLink>
          </>
        )}
        
        <NavLink to="/profile" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
          <span className="nav-icon">
            <UserCircle size={iconSize} />
          </span>
          <span className="nav-text">My Profile</span>
        </NavLink>
        
        <NavLink to="/help" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
          <span className="nav-icon">
            <HelpCircle size={iconSize} />
          </span>
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
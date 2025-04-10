import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import './Sidebar.css';
// Import appropriate icons from Lucide React
import { 
  LayoutDashboard, 
  Users, 
  Settings, 
  UserCircle, 
  HelpCircle, 
  ChevronDown, 
  ChevronRight, 
  Folder 
} from 'lucide-react';

const Sidebar = ({ userRole, isSidebarCollapsed }) => {
  // Set consistent icon size
  const iconSize = 22;
  
  // State to manage dashboard submenu
  const [isDashboardSubmenuOpen, setIsDashboardSubmenuOpen] = useState(false);
  
  // Toggle submenu function
  const toggleDashboardSubmenu = () => {
    if (!isSidebarCollapsed) {
      setIsDashboardSubmenuOpen(!isDashboardSubmenuOpen);
    }
  };
  
  return (
    <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
      <nav className="sidebar-nav">
        <div 
          className={`nav-link ${isDashboardSubmenuOpen ? 'active' : ''}`} 
          onClick={toggleDashboardSubmenu}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', position: 'relative' }}
        >
          <span className="nav-icon">
            <LayoutDashboard size={iconSize} />
          </span>
          <span className="nav-text">Dashboard</span>
          {!isSidebarCollapsed && (
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
              {isDashboardSubmenuOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </span>
          )}
        </div>
        
        {!isSidebarCollapsed && (
          <div className={`dashboard-submenu ${isDashboardSubmenuOpen ? 'open' : ''}`}>

            <NavLink to="/user-management" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-icon">
                <Users size={iconSize} />
              </span>
              <span className="nav-text">User Management</span>
            </NavLink>
            
            <NavLink to="/project-management" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-icon">
                <Folder size={iconSize} />
              </span>
              <span className="nav-text">Project Management</span>
            </NavLink>
          </div>
        )}
        
        {userRole === 'admin' && (
          <NavLink to="/settings" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">
              <Settings size={iconSize} />
            </span>
            <span className="nav-text">System Settings</span>
          </NavLink>
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
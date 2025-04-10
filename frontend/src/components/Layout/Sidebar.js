import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
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
  
  // Get current location to check active routes
  const location = useLocation();
  
  // Toggle submenu function
  const toggleDashboardSubmenu = (e) => {
    // Prevent navigation and event propagation
    e.preventDefault();
    e.stopPropagation();
    
    if (!isSidebarCollapsed) {
      setIsDashboardSubmenuOpen(!isDashboardSubmenuOpen);
    }
  };
  
  // Effect to handle submenu state when sidebar is collapsed
  useEffect(() => {
    if (isSidebarCollapsed) {
      // Automatically close submenu when sidebar collapses
      setIsDashboardSubmenuOpen(false);
    }
  }, [isSidebarCollapsed]);
  
  // Effect to open submenu if any submenu route is active
  useEffect(() => {
    if (!isSidebarCollapsed) {
      const submenuRoutes = ['/', '/user-management', '/project-management'];
      const isSubmenuRouteActive = submenuRoutes.some(route => 
        location.pathname.startsWith(route)
      );
      
      // Automatically open submenu if a submenu route is active
      if (isSubmenuRouteActive) {
        setIsDashboardSubmenuOpen(true);
      }
    }
  }, [location.pathname, isSidebarCollapsed]);
  
  return (
    <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
      <nav className="sidebar-nav">
        <NavLink 
          to="/" 
          className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}
        >
          <span className="nav-icon">
            <LayoutDashboard size={iconSize} />
          </span>
          <span className="nav-text">Dashboard</span>
          {!isSidebarCollapsed && (
            <span 
              onClick={toggleDashboardSubmenu} 
              style={{ 
                marginLeft: 'auto', 
                display: 'flex', 
                alignItems: 'center', 
                cursor: 'pointer',
                padding: '0 5px'  // Add some padding for easier clicking
              }}
            >
              {isDashboardSubmenuOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </span>
          )}
        </NavLink>
        
        {!isSidebarCollapsed && (
          <div className={`dashboard-submenu ${isDashboardSubmenuOpen ? 'open' : ''}`}>
            {userRole === 'admin' && (
            <NavLink to="/user-management" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-icon">
                <Users size={iconSize} />
              </span>
              <span className="nav-text">User Management</span>
            </NavLink>)}
            
            {userRole === 'admin' && (
            <NavLink to="/project-management" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-icon">
                <Folder size={iconSize} />
              </span>
              <span className="nav-text">Project Management</span>
            </NavLink>)}
          </div>
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
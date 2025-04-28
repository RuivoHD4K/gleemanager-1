import React, { useState, useEffect, useRef } from 'react';
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
  Folder,
  FileSpreadsheet,
  Building2
} from 'lucide-react';

const Sidebar = ({ userRole, isSidebarCollapsed }) => {
  // Set consistent icon size
  const iconSize = 22;
  
  // State to manage dashboard submenu
  const [isDashboardSubmenuOpen, setIsDashboardSubmenuOpen] = useState(false);
  // State to track closing animation
  const [isClosing, setIsClosing] = useState(false);
  
  // Reference to the submenu element for direct DOM manipulation during animations
  const submenuRef = useRef(null);
  
  // State to save submenu state when sidebar is collapsed
  const [savedSubmenuState, setSavedSubmenuState] = useState(false);
  const [prevSidebarCollapsed, setPrevSidebarCollapsed] = useState(isSidebarCollapsed);
  
  // Check if submenu has items based on user role
  const hasSubmenuItems = userRole === 'admin';
  
  // Get current location to check active routes
  const location = useLocation();
  
  // Toggle submenu function
  const toggleDashboardSubmenu = (e) => {
    // Prevent navigation and event propagation
    e.preventDefault();
    e.stopPropagation();
    
    if (!isSidebarCollapsed && hasSubmenuItems) {
      if (isDashboardSubmenuOpen) {
        // Start the closing animation first
        setIsClosing(true);
        
        // Then after the animation duration, actually close the submenu
        setTimeout(() => {
          setIsDashboardSubmenuOpen(false);
          setIsClosing(false);
        }, 600); // Match this to CSS transition time
      } else {
        // Simply open the submenu
        setIsDashboardSubmenuOpen(true);
      }
    }
  };
  
  // Effect to handle submenu state when sidebar is collapsed/expanded
  useEffect(() => {
    // If sidebar state changed
    if (prevSidebarCollapsed !== isSidebarCollapsed) {
      if (isSidebarCollapsed) {
        // Save current submenu state before collapsing
        setSavedSubmenuState(isDashboardSubmenuOpen);
        
        // Start closing animation only if submenu is open
        if (isDashboardSubmenuOpen) {
          setIsClosing(true);
          
          // Wait for animation to complete before actually changing state
          setTimeout(() => {
            setIsDashboardSubmenuOpen(false);
            setIsClosing(false);
          }, 600); // Match to CSS transition duration
        }
      } else {
        // When expanding, restore previous state after a short delay
        setTimeout(() => {
          setIsDashboardSubmenuOpen(savedSubmenuState);
        }, 150);
      }
      // Update previous sidebar state
      setPrevSidebarCollapsed(isSidebarCollapsed);
    }
  }, [isSidebarCollapsed, prevSidebarCollapsed, isDashboardSubmenuOpen, savedSubmenuState]);
  
  // Effect to open submenu only on initial load or route change
  useEffect(() => {
    if (!isSidebarCollapsed && hasSubmenuItems) {
      const submenuRoutes = ['/user-management', '/project-management', '/excel-templates']; // Added excel-templates
      const isSubmenuRouteActive = submenuRoutes.some(route => 
        location.pathname.startsWith(route)
      );
      
      // Automatically open submenu if a submenu route is active, but only on initial render or route change
      if (isSubmenuRouteActive) {
        setIsDashboardSubmenuOpen(true);
      }
    }
  }, [location.pathname, hasSubmenuItems, isSidebarCollapsed]);
  
  return (
    <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
      <nav className="sidebar-nav">
        <NavLink 
          to="/" 
          className={({isActive}) => 
            `nav-link ${isActive ? 'active' : ''} ${isDashboardSubmenuOpen ? 'submenu-expanded' : ''}`
          }
        >
          <span className="nav-icon">
            <LayoutDashboard size={iconSize} />
          </span>
          <span className="nav-text">Dashboard</span>
          {!isSidebarCollapsed && hasSubmenuItems && (
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
          <div 
            ref={submenuRef} 
            className={`dashboard-submenu ${isDashboardSubmenuOpen ? 'open' : ''} ${isClosing ? 'closing' : ''}`}
          >
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
            
            {userRole === 'admin' && (
            <NavLink to="/excel-templates" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-icon">
                <FileSpreadsheet size={iconSize} />
              </span>
              <span className="nav-text">Excel Templates</span>
            </NavLink>)}

            {userRole === 'admin' && (
            <NavLink to="/company-management" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-icon">
                <Building2 size={iconSize} />
              </span>
              <span className="nav-text">Company Management</span>
            </NavLink>)}
          </div>
        )}
        
        <NavLink to="/profile" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
          <span className="nav-icon">
            <UserCircle size={iconSize} />
          </span>
          <span className="nav-text">My Profile</span>
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
import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import './BaseLayout.css';

const BaseLayout = ({ userRole, handleLogout }) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  return (
    <div className="app-container">
      <Header 
        toggleSidebar={toggleSidebar} 
        isSidebarCollapsed={isSidebarCollapsed}
        handleLogout={handleLogout}
      />
      
      <div className="main-container">
        <Sidebar 
          userRole={userRole} 
          isSidebarCollapsed={isSidebarCollapsed}
        />
        
        <main className={`content-area ${isSidebarCollapsed ? 'expanded' : ''}`}>
          <Outlet />
        </main>
      </div>
      
      <div className={`role-indicator ${userRole === 'admin' ? 'admin-role' : 'user-role'}`}>
        {userRole === 'admin' ? 'Admin Access' : 'Standard User'}
      </div>
    </div>
  );
};

export default BaseLayout;
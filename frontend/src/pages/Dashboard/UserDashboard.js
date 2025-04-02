import React from 'react';
import { useNavigate } from 'react-router-dom';
import UsersList from '../../components/UsersList';

const UserDashboard = () => {
  const navigate = useNavigate();

  return (
    <div className="user-dashboard">
      <div className="page-header">
        <h1>Welcome to GleeManager</h1>
        <div className="page-actions">
          <button className="action-btn" onClick={() => navigate("/profile")}>
            My Profile
          </button>
          <button className="action-btn" onClick={() => navigate("/help")}>
            Help
          </button>
        </div>
      </div>
      
      <div className="dashboard-grid">
        <div className="dashboard-card welcome-card">
          <h3>Getting Started</h3>
          <p>Welcome to GleeManager! Here are some things you can do:</p>
          <ul>
            <li>View your profile and update settings</li>
            <li>Connect with other users</li>
            <li>Explore the system features</li>
          </ul>
        </div>
        
        <div className="dashboard-card">
          <h3>Your Stats</h3>
          <div className="stats-content">
            <div className="stat-item">
              <span className="stat-label">Account Age</span>
              <span className="stat-value">3 days</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Last Login</span>
              <span className="stat-value">Today</span>
            </div>
          </div>
        </div>
      </div>
      
      <UsersList />
    </div>
  );
};

export default UserDashboard;
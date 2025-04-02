import React from 'react';
import { useNavigate } from 'react-router-dom';
import UsersList from '../../components/UsersList';

const AdminDashboard = () => {
  const navigate = useNavigate();

  return (
    <div className="admin-dashboard">
      <div className="page-header">
        <h1>Admin Dashboard</h1>
        <div className="page-actions">
          <button className="action-btn" onClick={() => navigate("/user-management")}>
            Manage Users
          </button>
          <button className="action-btn" onClick={() => navigate("/settings")}>
            System Settings
          </button>
        </div>
      </div>
      
      <div className="dashboard-grid">
        <div className="dashboard-card stats-card">
          <h3>System Statistics</h3>
          <div className="stats-content">
            <div className="stat-item">
              <span className="stat-label">Total Users</span>
              <span className="stat-value">243</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Active Today</span>
              <span className="stat-value">46</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">New This Week</span>
              <span className="stat-value">12</span>
            </div>
          </div>
        </div>
        
        <div className="dashboard-card">
          <h3>Recent Activity</h3>
          <ul className="activity-list">
            <li>User john@example.com logged in (2 min ago)</li>
            <li>New user registered: jane@example.com (15 min ago)</li>
            <li>Password reset for bob@example.com (1 hour ago)</li>
          </ul>
        </div>
      </div>
      
      <UsersList />
    </div>
  );
};

export default AdminDashboard;
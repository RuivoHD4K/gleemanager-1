import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import UsersList from '../../components/UsersList/UsersList';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';

const UserDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userStats, setUserStats] = useState({
    accountAge: '3 days',
    lastLogin: 'Today'
  });

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem("authToken");
        const userId = localStorage.getItem("userId");
        
        if (!token || !userId) {
          // If no token or userId, redirect to login
          navigate("/login");
          return;
        }
        
        // Fetch user-specific statistics
        const statsResponse = await fetch(`http://localhost:5000/users/${userId}/stats`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        }).catch(() => ({ ok: false })); // Handle network errors
        
        // Process stats data if available
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          setUserStats(statsData);
        }
        
        // Add a slight delay to ensure minimum loading time for better UX
        setTimeout(() => {
          setLoading(false);
        }, 500);
      } catch (error) {
        console.error("Error fetching user dashboard data:", error);
        
        // Add a slight delay before hiding the loading spinner
        setTimeout(() => {
          setLoading(false);
        }, 500);
      }
    };
    
    fetchUserData();
  }, [navigate]);

  return (
    <LoadingSpinner isLoading={loading}>
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
                <span className="stat-value">{userStats.accountAge}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Last Login</span>
                <span className="stat-value">{userStats.lastLogin}</span>
              </div>
            </div>
          </div>
        </div>
        
        <UsersList />
      </div>
    </LoadingSpinner>
  );
};

export default UserDashboard;
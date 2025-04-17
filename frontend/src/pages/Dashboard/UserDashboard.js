import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';

const UserDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userStats, setUserStats] = useState({
    accountAge: 'Loading...',
    lastLogin: 'Loading...',
    isOnline: false
  });
  const [userData, setUserData] = useState(null);

  // Format the date in DD/MM/YYYY format
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}/${month}/${year}`;
  };

  // Format the time elapsed since a timestamp
  const formatTimeElapsed = (timestamp) => {
    if (!timestamp) return "Never";
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    
    // Less than a minute
    if (diffMs < 60000) {
      return "Just now";
    }
    
    // Less than an hour
    if (diffMs < 3600000) {
      const minutes = Math.floor(diffMs / 60000);
      return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
    }
    
    // Less than a day
    if (diffMs < 86400000) {
      const hours = Math.floor(diffMs / 3600000);
      return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    }
    
    // More than a day, show the date in DD/MM/YYYY format
    return formatDate(timestamp);
  };

  // Separate function to fetch user data without displaying loading state
  const fetchUserDataSilently = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const userId = localStorage.getItem("userId");
      
      if (!token || !userId) {
        // If no token or userId, redirect to login
        navigate("/login");
        return;
      }
      
      // Fetch user-specific data and statistics
      const userResponse = await fetch(`http://localhost:5000/users/${userId}`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      }).catch(() => ({ ok: false })); // Handle network errors
      
      if (userResponse.ok) {
        const userData = await userResponse.json();
        setUserData(userData);
        
        // Calculate account age
        const createdAt = new Date(userData.createdAt);
        const now = new Date();
        const diffDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
        
        // Format account age
        let accountAge;
        if (diffDays === 0) {
          accountAge = "Today";
        } else if (diffDays === 1) {
          accountAge = "1 day";
        } else if (diffDays < 30) {
          accountAge = `${diffDays} days`;
        } else if (diffDays < 365) {
          const months = Math.floor(diffDays / 30);
          accountAge = `${months} ${months === 1 ? 'month' : 'months'}`;
        } else {
          const years = Math.floor(diffDays / 365);
          const remainingMonths = Math.floor((diffDays % 365) / 30);
          if (remainingMonths === 0) {
            accountAge = `${years} ${years === 1 ? 'year' : 'years'}`;
          } else {
            accountAge = `${years} ${years === 1 ? 'year' : 'years'}, ${remainingMonths} ${remainingMonths === 1 ? 'month' : 'months'}`;
          }
        }
        
        // Format last login using lastLogin field instead of lastSeen
        // This shows the previous login timestamp, not the current one
        const lastLogin = userData.lastLogin 
          ? formatTimeElapsed(userData.lastLogin) 
          : "First login";
        
        setUserStats({
          accountAge,
          lastLogin,
          isOnline: userData.isOnline
        });
      }
    } catch (error) {
      console.error("Error fetching user dashboard data:", error);
      // Don't update the state on error during silent updates
      // This prevents showing error messages during background refreshes
    }
  };

  // Initial data fetch with loading state
  const initialFetchUserData = async () => {
    setLoading(true);
    
    try {
      await fetchUserDataSilently();
    } catch (error) {
      setUserStats({
        accountAge: 'Error loading',
        lastLogin: 'Error loading',
        isOnline: false
      });
    } finally {
      // Add a slight delay to ensure minimum loading time for better UX
      setTimeout(() => {
        setLoading(false);
      }, 50);
    }
  };

  useEffect(() => {
    // Initial fetch with loading state
    initialFetchUserData();
    
    // Set up polling to update data silently every 30 seconds
    // This won't show loading state or disrupt the user experience
    const intervalId = setInterval(() => {
      fetchUserDataSilently();
    }, 30000);
    
    // Clean up the interval on component unmount
    return () => clearInterval(intervalId);
  }, [navigate]);

  return (
    <LoadingSpinner isLoading={loading}>
      <div className="user-dashboard">
        <div className="page-header">
          <h1>Welcome to GleeManager</h1>
          <div className="page-actions">
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
                <span className="stat-value">
                  {userStats.isOnline && (
                    <span className="status-indicator online"></span>
                  )}
                  {!userStats.isOnline && userStats.lastLogin !== 'Loading...' && userStats.lastLogin !== 'Error loading' && (
                    <span className="status-indicator offline"></span>
                  )}
                  {userStats.lastLogin}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </LoadingSpinner>
  );
};

export default UserDashboard;
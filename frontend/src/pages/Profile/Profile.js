import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import './Profile.css';

const Profile = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  
  // User data states
  const [userData, setUserData] = useState({
    email: '',
    username: '',
    role: '',
    userId: '',
    createdAt: ''
  });
  
  // Form states
  const [usernameForm, setUsernameForm] = useState({
    username: ''
  });
  
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  
  // Load user data on component mount
  useEffect(() => {
    const userId = localStorage.getItem('userId');
    const email = localStorage.getItem('userEmail');
    const username = localStorage.getItem('username');
    const role = localStorage.getItem('userRole');
    
    if (!userId || !email) {
      navigate('/login');
      return;
    }
    
    setUserData({
      email,
      username: username || email.split('@')[0],
      role: role || 'user',
      userId
    });
    
    setUsernameForm({
      username: username || email.split('@')[0]
    });
    
    // Fetch additional user data from API
    fetchUserData(userId);
  }, [navigate]);
  
  const fetchUserData = async (userId) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`http://localhost:5000/users/${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          // If user not found, just use the data from localStorage
          // No need to show an error
          setTimeout(() => {
            setLoading(false);
          }, 500);
          return;
        }
        throw new Error('Failed to fetch user data');
      }
      
      const data = await response.json();
      setUserData(prevData => ({
        ...prevData,
        ...data,
        username: data.username || prevData.username
      }));
      
      setUsernameForm(prevForm => ({
        username: data.username || prevForm.username
      }));
      
      // Add a slight delay to ensure minimum loading time for better UX
      setTimeout(() => {
        setLoading(false);
      }, 500);
    } catch (error) {
      console.error('Error fetching user data:', error);
      // Don't show notification for fetch errors, just use localStorage data
      setTimeout(() => {
        setLoading(false);
      }, 500);
    }
  };
  
  const handleUsernameChange = (e) => {
    setUsernameForm({
      ...usernameForm,
      [e.target.name]: e.target.value
    });
  };
  
  const handlePasswordChange = (e) => {
    setPasswordForm({
      ...passwordForm,
      [e.target.name]: e.target.value
    });
  };
  
  const updateUsername = async (e) => {
    e.preventDefault();
    
    if (!usernameForm.username.trim()) {
      showNotification('Username cannot be empty', 'error');
      return;
    }
    
    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`http://localhost:5000/users/${userData.userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: usernameForm.username,
          email: userData.email,
          role: userData.role
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update username');
      }
      
      // Update localStorage with new username
      localStorage.setItem('username', usernameForm.username);
      
      // Update userData state
      setUserData({
        ...userData,
        username: usernameForm.username
      });
      
      showNotification('Username updated successfully', 'success');
      
      // Add a slight delay before hiding the loading spinner
      setTimeout(() => {
        setLoading(false);
      }, 500);
    } catch (error) {
      console.error('Error updating username:', error);
      showNotification('Error updating username', 'error');
      setLoading(false);
    }
  };
  
  const updatePassword = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!passwordForm.currentPassword) {
      showNotification('Current password is required', 'error');
      return;
    }
    
    if (!passwordForm.newPassword) {
      showNotification('New password is required', 'error');
      return;
    }
    
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showNotification('New passwords do not match', 'error');
      return;
    }
    
    if (passwordForm.newPassword.length < 8) {
      showNotification('Password must be at least 8 characters long', 'error');
      return;
    }
    
    setLoading(true);
    try {
      // Call the API endpoint to update password
      const token = localStorage.getItem("authToken");
      
      // Verify current password first
      const verifyResponse = await fetch("http://localhost:5000/authenticate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ 
          email: userData.email, 
          password: passwordForm.currentPassword 
        })
      });
      
      const verifyData = await verifyResponse.json();
      
      if (!verifyResponse.ok || !verifyData.authenticated) {
        throw new Error("Current password is incorrect");
      }
      
      // Update password
      const response = await fetch(`http://localhost:5000/users/${userData.userId}/password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          password: passwordForm.newPassword
        })
      });
      
      // Handle the response
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update password');
      }
      
      // Clear password form
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      
      showNotification('Password updated successfully', 'success');
      
      // Add a slight delay before hiding the loading spinner
      setTimeout(() => {
        setLoading(false);
      }, 500);
    } catch (error) {
      console.error('Error updating password:', error);
      showNotification(error.message || 'Error updating password', 'error');
      setLoading(false);
    }
  };
  
  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    
    // Auto-clear notification after 5 seconds
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };
  
  return (
    <LoadingSpinner isLoading={loading}>
      <div className="profile-container">
        <div className="page-header">
          <h1>My Profile</h1>
        </div>
        
        {notification && (
          <div className={`notification ${notification.type}`}>
            {notification.message}
          </div>
        )}
        
        <div className="profile-grid">
          {/* User information card */}
          <div className="dashboard-card profile-card">
            <h3>User Information</h3>
            <div className="user-details">
              <div className="user-avatar">
                <div 
                  className="avatar-large"
                  style={{ 
                    backgroundColor: userData.role === 'admin' ? '#f85444' : '#ff9a3c' 
                  }}
                >
                  {userData.username ? userData.username[0].toUpperCase() : '?'}
                </div>
                <div className="user-role-badge">
                  {userData.role === 'admin' ? 'Administrator' : 'Standard User'}
                </div>
              </div>
              
              <div className="user-info-grid">
                <div className="info-label">Email:</div>
                <div className="info-value">{userData.email}</div>
                
                <div className="info-label">Username:</div>
                <div className="info-value">{userData.username}</div>
                
                <div className="info-label">User ID:</div>
                <div className="info-value user-id">{userData.userId}</div>
                
                {userData.createdAt && (
                  <>
                    <div className="info-label">Joined:</div>
                    <div className="info-value">
                      {new Date(userData.createdAt).toLocaleDateString()}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          
          {/* Update username card */}
          <div className="dashboard-card edit-card">
            <h3>Update Username</h3>
            <form onSubmit={updateUsername} className="profile-form">
              <div className="form-group">
                <label htmlFor="username">Username</label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={usernameForm.username}
                  onChange={handleUsernameChange}
                  disabled={loading}
                  required
                />
                <p className="form-help">This name will be displayed throughout the application.</p>
              </div>
              
              <button 
                type="submit" 
                className="action-btn" 
                disabled={loading}
              >
                {loading ? 'Updating...' : 'Update Username'}
              </button>
            </form>
          </div>
          
          {/* Change password card */}
          <div className="dashboard-card edit-card">
            <h3>Change Password</h3>
            <form onSubmit={updatePassword} className="profile-form">
              <div className="form-group">
                <label htmlFor="currentPassword">Current Password</label>
                <input
                  type="password"
                  id="currentPassword"
                  name="currentPassword"
                  value={passwordForm.currentPassword}
                  onChange={handlePasswordChange}
                  disabled={loading}
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="newPassword">New Password</label>
                <input
                  type="password"
                  id="newPassword"
                  name="newPassword"
                  value={passwordForm.newPassword}
                  onChange={handlePasswordChange}
                  disabled={loading}
                  required
                />
                <p className="form-help">Password must be at least 8 characters long.</p>
              </div>
              
              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm New Password</label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  value={passwordForm.confirmPassword}
                  onChange={handlePasswordChange}
                  disabled={loading}
                  required
                />
              </div>
              
              <button 
                type="submit" 
                className="action-btn" 
                disabled={loading}
              >
                {loading ? 'Updating...' : 'Change Password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </LoadingSpinner>
  );
};

export default Profile;
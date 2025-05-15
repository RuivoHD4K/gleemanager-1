import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useToast } from '../../components/Toast/ToastContext';
import { Upload, Pencil, Trash2 } from 'lucide-react';

const UserDashboard = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [userStats, setUserStats] = useState({
    accountAge: 'Loading...',
    lastLogin: 'Loading...',
    isOnline: false
  });
  const [userData, setUserData] = useState(null);
  
  // Signature related states
  const [signature, setSignature] = useState(null);
  const [signatureLoading, setSignatureLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

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
      
      // Fetch signature
      await fetchSignature();
      
    } catch (error) {
      console.error("Error fetching user dashboard data:", error);
      // Don't update the state on error during silent updates
      // This prevents showing error messages during background refreshes
    }
  };

  // Fetch user signature
  const fetchSignature = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const userId = localStorage.getItem("userId");
      
      if (!token || !userId) return;
      
      const response = await fetch(`http://localhost:5000/users/${userId}/signature`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.signatureUrl) {
          setSignature(data.signatureUrl);
        }
      }
    } catch (error) {
      console.error("Error fetching signature:", error);
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

  // Upload signature function
  const uploadSignature = async (file) => {
    try {
      setSignatureLoading(true);
      setUploadProgress(0);
      
      const token = localStorage.getItem("authToken");
      const userId = localStorage.getItem("userId");
      
      if (!token || !userId) {
        throw new Error("Not authenticated");
      }
      
      // Create formData for file upload
      const formData = new FormData();
      formData.append('signature', file);
      
      // Set up simulated upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);
      
      // Send the file to the API
      const response = await fetch(`http://localhost:5000/users/${userId}/signature`, {
        method: 'POST',
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: formData
      });
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      if (!response.ok) {
        throw new Error("Failed to upload signature");
      }
      
      const data = await response.json();
      setSignature(data.signatureUrl);
      
      toast.showSuccess("Signature uploaded successfully");
    } catch (error) {
      toast.showError(`Error uploading signature: ${error.message}`);
    } finally {
      setSignatureLoading(false);
      setUploadProgress(0);
    }
  };

  // Handle file input change
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Check file type
    if (!file.type.includes('image/')) {
      toast.showError("Please upload an image file");
      return;
    }
    
    // Check file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.showError("File size should be less than 2MB");
      return;
    }
    
    uploadSignature(file);
  };

  // Delete signature
  const deleteSignature = async () => {
    try {
      setSignatureLoading(true);
      
      const token = localStorage.getItem("authToken");
      const userId = localStorage.getItem("userId");
      
      if (!token || !userId) {
        throw new Error("Not authenticated");
      }
      
      const response = await fetch(`http://localhost:5000/users/${userId}/signature`, {
        method: 'DELETE',
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to delete signature");
      }
      
      setSignature(null);
      toast.showSuccess("Signature deleted successfully");
    } catch (error) {
      toast.showError(`Error deleting signature: ${error.message}`);
    } finally {
      setSignatureLoading(false);
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
          
          {/* New Signature Upload Card */}
          <div className="dashboard-card signature-card">
            <h3>Your Signature</h3>
            <div className="signature-container">
              {signatureLoading ? (
                <div className="signature-loading">
                  <div className="signature-spinner"></div>
                  {uploadProgress > 0 && (
                    <div className="upload-progress-container">
                      <div 
                        className="upload-progress-bar" 
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                      <span className="upload-progress-text">{uploadProgress}%</span>
                    </div>
                  )}
                </div>
              ) : signature ? (
                <div className="signature-image-container">
                  <img 
                    src={signature} 
                    alt="Your signature" 
                    className="signature-image" 
                  />
                  <div className="signature-actions">
                    <label htmlFor="update-signature" className="signature-action-btn edit-btn">
                      <Pencil size={16} />
                    </label>
                    <input
                      type="file"
                      id="update-signature"
                      accept="image/*"
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                    />
                    <button 
                      className="signature-action-btn delete-btn"
                      onClick={deleteSignature}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="signature-upload">
                  <p>Upload your signature to use in documents</p>
                  <label htmlFor="signature-upload" className="signature-upload-btn">
                    <Upload size={20} />
                    <span>Upload Signature</span>
                  </label>
                  <input
                    type="file"
                    id="signature-upload"
                    accept="image/*"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                  <p className="signature-upload-help">
                    Supported formats: JPG, PNG, GIF (max 2MB)
                  </p>
                </div>
              )}
            </div>
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
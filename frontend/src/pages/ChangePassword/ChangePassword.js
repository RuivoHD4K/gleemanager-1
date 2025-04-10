import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import './ChangePassword.css';

const ChangePassword = ({ setMustChangePassword }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');
  const navigate = useNavigate();

  // Get the user ID from localStorage
  const userId = localStorage.getItem('userId');
  const email = localStorage.getItem('userEmail');
  
  // Check if user is authenticated and required to change password
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('authToken');
      const mustChange = localStorage.getItem('mustChangePassword') === 'true';
      
      if (!token || !userId) {
        navigate('/login');
        return;
      }
      
      if (!mustChange) {
        navigate('/');
        return;
      }
      
      // Simulate a brief loading period
      setTimeout(() => {
        setLoading(false);
      }, 500);
    };
    
    checkAuth();
  }, [userId, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Reset messages
    setError('');
    setSuccessMessage('');
    
    // Validate inputs
    if (!password) {
      setError('Please enter a new password');
      return;
    }
    
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    setLoading(true);
    
    try {
      // Get token from localStorage
      const token = localStorage.getItem('authToken');
      
      if (!token || !userId) {
        throw new Error('Authentication required');
      }
      
      // Send request to update password
      const response = await fetch(`http://localhost:5000/users/${userId}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password })
      });
      
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to update password');
      }
      
      // Update was successful
      setSuccessMessage('Password updated successfully! Redirecting...');
      
      // Update localStorage to remove the mustChangePassword flag
      localStorage.setItem('mustChangePassword', 'false');
      
      // Update parent component state
      setMustChangePassword(false);
      
      // Redirect to dashboard after a short delay
      setTimeout(() => {
        navigate('/');
      }, 2000);
      
    } catch (error) {
      console.error('Error updating password:', error);
      setError('Failed to update password: ' + error.message);
      setLoading(false);
    }
  };

  return (
    <LoadingSpinner isLoading={loading}>
      <div className="change-password-container">
        <div className="change-password-box">
          <div className="app-logo">
            <h1>GleeManager</h1>
            <p>Please change your password</p>
          </div>
          
          {error && <div className="notification error">{error}</div>}
          {successMessage && <div className="notification success">{successMessage}</div>}
          
          <div className="password-info">
            <p>For {email}</p>
            <p className="password-instruction">
              You need to set a new password before continuing.
            </p>
          </div>
          
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="password">New Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                placeholder="Enter new password"
                required
              />
              <p className="form-help">Password must be at least 8 characters long.</p>
            </div>
            
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm New Password</label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                placeholder="Confirm new password"
                required
              />
            </div>
            
            <button 
              type="submit" 
              className="submit-btn" 
              disabled={loading}
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </LoadingSpinner>
  );
};

export default ChangePassword;
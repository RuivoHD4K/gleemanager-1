import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import LoadingSpinner from "../LoadingSpinner/LoadingSpinner";
import "./UsersList.css";

const UsersList = ({ onlyShowOnline = false }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchUsers();
    
    // Set up regular fetching of users to update online status every 10 seconds
    const intervalId = setInterval(() => {
      fetchUsers(false); // Don't show loading state for background refreshes
    }, 10000); // Update every 10 seconds
    
    return () => clearInterval(intervalId); // Clean up on unmount
  }, []);

  const fetchUsers = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch("http://localhost:5000/users", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          // Handle unauthorized (invalid/expired token)
          localStorage.removeItem("authToken");
          localStorage.removeItem("isAuthenticated");
          navigate("/login");
          throw new Error("Your session has expired. Please log in again.");
        }
        throw new Error("Failed to fetch users");
      }
      
      const data = await response.json();
      
      // Filter users based on onlyShowOnline prop
      const filteredUsers = onlyShowOnline 
        ? data.filter(user => user.isOnline) 
        : data;
        
      setUsers(filteredUsers);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      if (showLoading) {
        setTimeout(() => {
          setLoading(false);
        }, 500);
      }
    }
  };

  // Format the date in DD/MM/YYYY format
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}/${month}/${year}`;
  };

  // Format the time elapsed since a given timestamp
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

  // Format the status text for the user
  const formatStatusText = (user) => {
    if (user.isOnline) {
      return 'Online';
    } else if (user.lastLogin) {
      return `Last login: ${formatTimeElapsed(user.lastLogin)}`;
    } else {
      return `Last seen: ${formatTimeElapsed(user.lastSeen)}`;
    }
  };

  // Exclamation Icon for password warning
  const ExclamationIcon = () => (
    <span className="password-warning">!</span>
  );

  return (
    <div className="dashboard-card">
      <h3>{onlyShowOnline ? "Online Users" : "Users in Database"}</h3>
      
      <LoadingSpinner isLoading={loading}>
        {error ? (
          <div className="error-message">Error: {error}</div>
        ) : users.length === 0 ? (
          <p>{onlyShowOnline ? "No users currently online" : "No users found"}</p>
        ) : (
          <div className="users-table-container">
            <table className="users-table">
              <thead>
                <tr>
                  <th className="username-col">Username</th>
                  <th className="email-col">Email</th>
                  <th className="created-col">Created</th>
                  <th className="role-col">Role</th>
                  {!onlyShowOnline && <th className="status-col">Status</th>}
                  <th className="userid-col">User ID</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, index) => (
                  <tr key={user.userId || index}>
                    <td className="username-col">
                      {user.username || user.email.split('@')[0]}
                      {user.mustChangePassword && <ExclamationIcon />}
                    </td>
                    <td className="email-col">
                      {user.email}
                    </td>
                    <td className="created-col">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="role-col">
                      {user.role || "user"}
                    </td>
                    {!onlyShowOnline && (
                      <td className="status-col">
                        <span className={`status-indicator ${user.isOnline ? 'online' : 'offline'}`}></span>
                        <span className="status-text">
                          {formatStatusText(user)}
                        </span>
                      </td>
                    )}
                    <td className="userid-col">
                      {user.userId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </LoadingSpinner>
    </div>
  );
};

export default UsersList;
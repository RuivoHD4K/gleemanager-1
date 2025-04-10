import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
    } catch (err) {
      setError(err.message);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  // Format the time elapsed since last seen
  const formatLastSeen = (lastSeenDate) => {
    if (!lastSeenDate) return "Never";
    
    const lastSeen = new Date(lastSeenDate);
    const now = new Date();
    const diffMs = now - lastSeen;
    
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
    
    // More than a day, just show the date
    return lastSeen.toLocaleDateString();
  };

  if (loading) return <div className="loading-indicator">Loading users...</div>;
  if (error) return <div className="error-message">Error: {error}</div>;

  return (
    <div className="dashboard-card">
      <h3>{onlyShowOnline ? "Online Users" : "Users in Database"}</h3>
      {users.length === 0 ? (
        <p>{onlyShowOnline ? "No users currently online" : "No users found"}</p>
      ) : (
        <div className="users-table-container">
          <table className="users-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Created</th>
                <th>Role</th>
                <th>Status</th>
                <th>User ID</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, index) => (
                <tr key={user.userId || index}>
                  <td>{user.email}</td>
                  <td>{new Date(user.createdAt).toLocaleString()}</td>
                  <td className="user-role-cell">{user.role || "user"}</td>
                  <td className="user-status-cell">
                    <span className={`status-indicator ${user.isOnline ? 'online' : 'offline'}`}></span>
                    {user.isOnline ? 'Online' : `Last seen: ${formatLastSeen(user.lastSeen)}`}
                  </td>
                  <td className="user-id">{user.userId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default UsersList;
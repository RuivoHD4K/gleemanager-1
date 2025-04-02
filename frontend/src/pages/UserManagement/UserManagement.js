import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./UserManagement.css";

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState({
    email: "",
    username: "",
    role: "user"
  });
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const navigate = useNavigate();

  // Fetch users on component mount
  useEffect(() => {
    fetchUsers();
  }, []);

  // Update form data when a user is selected
  useEffect(() => {
    if (selectedUser) {
      setFormData({
        email: selectedUser.email,
        username: selectedUser.username || "",
        role: selectedUser.role || "user"
      });
    }
  }, [selectedUser]);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch("http://localhost:5000/users", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem("authToken");
          localStorage.removeItem("isAuthenticated");
          navigate("/login");
          throw new Error("Your session has expired. Please log in again.");
        }
        throw new Error("Failed to fetch users");
      }
      
      const data = await response.json();
      setUsers(data);
      
      // Select first user by default if available
      if (data.length > 0 && !selectedUser) {
        setSelectedUser(data[0]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleUserSelect = (user) => {
    setSelectedUser(user);
  };

  const generateRandomPassword = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  const handleGeneratePassword = async () => {
    if (!selectedUser) return;
    
    const newPass = generateRandomPassword();
    setNewPassword(newPass);
    
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`http://localhost:5000/users/${selectedUser.userId}/password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ password: newPass })
      });
      
      if (!response.ok) {
        throw new Error("Failed to update password");
      }
      
      setShowPasswordModal(true);
    } catch (err) {
      setError("Failed to update password: " + err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedUser) return;
    
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`http://localhost:5000/users/${selectedUser.userId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      
      if (!response.ok) {
        throw new Error("Failed to update user");
      }
      
      // Refresh user list to show updated data
      fetchUsers();
      
      // Update local storage if the current user was updated
      const currentUserId = localStorage.getItem("userId");
      if (currentUserId === selectedUser.userId) {
        localStorage.setItem("username", formData.username || formData.email.split('@')[0]);
      }
      
      // Show success message
      setError("User updated successfully!");
      setTimeout(() => setError(null), 3000);
    } catch (err) {
      setError("Failed to update user: " + err.message);
    }
  };

  if (loading) return <div className="loading-indicator">Loading users...</div>;

  return (
    <div className="user-management-container">
      <div className="page-header">
        <h1>User Management</h1>
      </div>
      
      {error && (
        <div className={`notification ${error.includes("successfully") ? "success" : "error"}`}>
          {error}
        </div>
      )}
      
      <div className="user-management-grid">
        {/* Users list card */}
        <div className="dashboard-card users-list-card">
          <h3>Users</h3>
          <div className="users-list-container">
            {users.length === 0 ? (
              <p>No users found</p>
            ) : (
              <ul className="users-select-list">
                {users.map((user) => (
                  <li 
                    key={user.userId} 
                    onClick={() => handleUserSelect(user)}
                    className={selectedUser && selectedUser.userId === user.userId ? "selected" : ""}
                  >
                    <div className="user-list-item">
                      <div className="user-info">
                        <span className="user-email">{user.email}</span>
                        <span className="user-role">{user.role || "user"}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        
        {/* User edit form card */}
        <div className="dashboard-card user-edit-card">
          <h3>Edit User</h3>
          {selectedUser ? (
            <form onSubmit={handleSubmit} className="user-edit-form">
              <div className="form-group">
                <label htmlFor="username">Username</label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="role">Role</label>
                <select
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={handleInputChange}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              
              <div className="form-actions">
                <button type="submit" className="save-btn">
                  Save Changes
                </button>
                <button 
                  type="button" 
                  className="password-btn"
                  onClick={handleGeneratePassword}
                >
                  Generate New Password
                </button>
              </div>
            </form>
          ) : (
            <p>Select a user to edit</p>
          )}
        </div>
      </div>
      
      {/* Password modal popup */}
      {showPasswordModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>New Password Generated</h3>
            <p>
              A new password has been generated for <strong>{selectedUser.email}</strong>:
            </p>
            <div className="password-display">
              {newPassword}
            </div>
            <p className="modal-note">
              Please copy this password now. You won't be able to view it again.
            </p>
            <button 
              className="action-btn"
              onClick={() => setShowPasswordModal(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
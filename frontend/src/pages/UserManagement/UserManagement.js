import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./UserManagement.css";

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState({
    email: "",
    username: "",
    role: "user"
  });
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserData, setNewUserData] = useState({
    email: "",
    username: "",
    password: "",
    role: "user"
  });
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
      showNotification(err.message, "error");
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

  const handleNewUserInputChange = (e) => {
    const { name, value } = e.target;
    setNewUserData({
      ...newUserData,
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
      
      // The server will set mustChangePassword to true for admin password resets
      
      // Update user list to reflect the change
      const updatedUser = {...selectedUser, mustChangePassword: true};
      setUsers(users.map(user => 
        user.userId === selectedUser.userId ? updatedUser : user
      ));
      setSelectedUser(updatedUser);
      
      setShowPasswordModal(true);
    } catch (err) {
      showNotification("Failed to update password: " + err.message, "error");
    }
  };

  const handleCreateNewUser = () => {
    // Reset form data
    setNewUserData({
      email: "",
      username: "",
      password: generateRandomPassword(), // Generate a random initial password
      role: "user"
    });
    setShowAddUserModal(true);
  };

  const handleAddNewUser = async (e) => {
    e.preventDefault();
    
    // Basic validation
    if (!newUserData.email || !newUserData.password || !newUserData.username) {
      showNotification("All fields are required", "error");
      return;
    }
    
    if (newUserData.password.length < 8) {
      showNotification("Password must be at least 8 characters long", "error");
      return;
    }
    
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch("http://localhost:5000/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          email: newUserData.email,
          password: newUserData.password,
          username: newUserData.username,
          role: newUserData.role,
          createdAt: new Date().toISOString(),
          mustChangePassword: true // New users must change password on first login
        })
      });
      
      if (!response.ok) {
        throw new Error("Failed to create user");
      }
      
      const result = await response.json();
      
      // Add new user to state
      const newUser = result.user;
      setUsers([...users, {...newUser, mustChangePassword: true}]);
      
      // Select newly created user
      setSelectedUser({...newUser, mustChangePassword: true});
      
      setShowAddUserModal(false);
      showNotification(`User ${newUserData.email} created successfully!`, "success");
      
      // Refresh user list
      fetchUsers();
    } catch (err) {
      showNotification("Failed to create user: " + err.message, "error");
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
        body: JSON.stringify({
          ...formData,
          // Preserve the mustChangePassword flag
          mustChangePassword: selectedUser.mustChangePassword
        })
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
      showNotification("User updated successfully!", "success");
    } catch (err) {
      showNotification("Failed to update user: " + err.message, "error");
    }
  };

  const showNotification = (message, type = "info") => {
    setNotification({ message, type });
    
    // Auto-clear notification after 5 seconds
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  if (loading) return <div className="loading-indicator">Loading users...</div>;

  return (
    <div className="user-management-container">
      <div className="page-header">
        <h1>User Management</h1>
        <div className="page-actions">
          <button className="action-btn" onClick={handleCreateNewUser}>
            + New User
          </button>
        </div>
      </div>
      
      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
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
                        {user.mustChangePassword && (
                          <span className="password-status">Password change required</span>
                        )}
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
              
              <div className="password-status-display">
                {selectedUser.mustChangePassword ? (
                  <div className="password-change-required">
                    Password change required on next login
                  </div>
                ) : (
                  <div className="password-status-ok">
                    Password status: OK
                  </div>
                )}
              </div>
              
              <div className="form-actions">
                <button type="submit" className="action-btn save-btn">
                  Save Changes
                </button>
                <button 
                  type="button" 
                  className="action-btn password-btn"
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
            <p className="modal-note">
              <strong>Note:</strong> The user will be required to change this password on next login.
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

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>Add New User</h3>
            <form onSubmit={handleAddNewUser} className="user-edit-form">
              <div className="form-group">
                <label htmlFor="new-email">Email</label>
                <input
                  type="email"
                  id="new-email"
                  name="email"
                  value={newUserData.email}
                  onChange={handleNewUserInputChange}
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="new-username">Username</label>
                <input
                  type="text"
                  id="new-username"
                  name="username"
                  value={newUserData.username}
                  onChange={handleNewUserInputChange}
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="new-password">Password</label>
                <input
                  type="text" // Text to make it visible
                  id="new-password"
                  name="password"
                  value={newUserData.password}
                  onChange={handleNewUserInputChange}
                  required
                />
                <p className="form-help">
                  Password must be at least 8 characters long. 
                  The user will be required to change this password on first login.
                </p>
              </div>
              
              <div className="form-group">
                <label htmlFor="new-role">Role</label>
                <select
                  id="new-role"
                  name="role"
                  value={newUserData.role}
                  onChange={handleNewUserInputChange}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              
              <div className="form-actions">
                <button type="submit" className="action-btn save-btn">
                  Create User
                </button>
                <button 
                  type="button" 
                  className="action-btn password-btn"
                  onClick={() => setShowAddUserModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
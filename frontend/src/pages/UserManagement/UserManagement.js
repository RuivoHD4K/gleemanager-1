import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import LoadingSpinner from "../../components/LoadingSpinner/LoadingSpinner";
import { useToast } from "../../components/Toast/ToastContext";
import "./UserManagement.css";

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  const toast = useToast();
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
  
  // Authentication modal states
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [pendingAction, setPendingAction] = useState(null);
  
  // Delete confirmation modal state
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  
  // Store the original generated password
  const [originalGeneratedPassword, setOriginalGeneratedPassword] = useState("");
  const [isCustomPassword, setIsCustomPassword] = useState(false);
  const [isPasswordEditable, setIsPasswordEditable] = useState(false);

  // Project assignment states
  const [showProjectAssignModal, setShowProjectAssignModal] = useState(false);
  const [projects, setProjects] = useState([]);
  const [assignedProjects, setAssignedProjects] = useState([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  
  // New search states
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [projectSearchTerm, setProjectSearchTerm] = useState("");
  
  const navigate = useNavigate();

  useEffect(() =>  {
    fetchUsers();
  }, [] );

  const validatePassword = (password) => {
    if (password.length < 8) {
      return { valid: false, message: 'Password must be at least 8 characters long' };
    }
    
    const hasNumber = /[0-9]/.test(password);
    if (!hasNumber) {
      return { valid: false, message: 'Password must contain at least one number' };
    }
    
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    
    if (!hasSpecialChar && !(hasUppercase && hasLowercase)) {
      return { 
        valid: false, 
        message: 'Password must either contain a special character or both uppercase and lowercase letters' 
      };
    }
    
    return { valid: true, message: '' };
  };

  const fetchUsers = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      
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
      
      // Update users array
      setUsers(data);
      
      // If a user is selected, update their data in case it changed
      if (selectedUser) {
        const updatedSelectedUser = data.find(user => user.userId === selectedUser.userId);
        if (updatedSelectedUser) {
          setSelectedUser(updatedSelectedUser);
        } else {
          // If the selected user no longer exists, select the first user
          if (data.length > 0) {
            setSelectedUser(data[0]);
          } else {
            setSelectedUser(null);
          }
        }
      } else if (data.length > 0 && !selectedUser) {
        // Select first user by default if available and no user is currently selected
        setSelectedUser(data[0]);
      }
    } catch (err) {
      if (showLoading) {
        showNotification(err.message, "error");
      } else {
        console.error("Background refresh error:", err);
      }
    } finally {
      if (showLoading) {
        // Add a slight delay to ensure minimum loading time for UX
        setTimeout(() => {
          setLoading(false);
        }, 100);
      }
    }
  };

  // Filter users based on search term
  const filteredUsers = users.filter(user => {
    const searchTermLower = userSearchTerm.toLowerCase();
    return (
      user.email.toLowerCase().includes(searchTermLower) ||
      (user.username && user.username.toLowerCase().includes(searchTermLower))
    );
  });

  // Filter projects based on search term
  const filteredProjects = projects.filter(project => {
    const searchTermLower = projectSearchTerm.toLowerCase();
    return (
      project.projectName.toLowerCase().includes(searchTermLower) ||
      (project.company && project.company.toLowerCase().includes(searchTermLower))
    );
  });

  // Fetch all projects
  const fetchProjects = async () => {
    try {
      setIsLoadingProjects(true);
      const token = localStorage.getItem("authToken");
      const response = await fetch("http://localhost:5000/projects", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch projects");
      }
      
      const data = await response.json();
      setProjects(data);
    } catch (err) {
      showNotification("Failed to fetch projects: " + err.message, "error");
    } finally {
      setIsLoadingProjects(false);
    }
  };

  // Fetch user's assigned projects
  const fetchUserProjects = async (userId) => {
    try {
      setIsLoadingProjects(true);
      const token = localStorage.getItem("authToken");
      const response = await fetch(`http://localhost:5000/users/${userId}/projects`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch user projects");
      }
      
      const data = await response.json();
      setAssignedProjects(data.map(project => project.projectId));
    } catch (err) {
      console.error("Error fetching user projects:", err);
      setAssignedProjects([]);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  // Toggle project assignment
  const toggleProjectAssignment = async (projectId) => {
    try {
      const token = localStorage.getItem("authToken");
      const isAssigned = assignedProjects.includes(projectId);
      
      const method = isAssigned ? "DELETE" : "POST";
      const url = `http://localhost:5000/users/${selectedUser.userId}/projects/${projectId}`;
      
      const response = await fetch(url, {
        method,
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to ${isAssigned ? "remove" : "assign"} project`);
      }
      
      // Update the local state
      if (isAssigned) {
        setAssignedProjects(assignedProjects.filter(id => id !== projectId));
      } else {
        setAssignedProjects([...assignedProjects, projectId]);
      }
      
      showNotification(
        `Project ${isAssigned ? "unassigned from" : "assigned to"} user successfully`, 
        "success"
      );
    } catch (err) {
      showNotification(err.message, "error");
    }
  };

  // Handle project assignment modal
  const handleOpenProjectAssignModal = async () => {
    setProjectSearchTerm(""); // Reset project search term
    await fetchProjects();
    await fetchUserProjects(selectedUser.userId);
    setShowProjectAssignModal(true);
  };

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
    const uppercaseChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowercaseChars = "abcdefghijklmnopqrstuvwxyz";
    const numberChars = "0123456789";
    const specialChars = "!@#$%^&*()_+";
    
    // Ensure we have at least one of each required type
    let password = "";
    password += uppercaseChars.charAt(Math.floor(Math.random() * uppercaseChars.length));
    password += lowercaseChars.charAt(Math.floor(Math.random() * lowercaseChars.length));
    password += numberChars.charAt(Math.floor(Math.random() * numberChars.length));
    password += specialChars.charAt(Math.floor(Math.random() * specialChars.length));
    
    // Fill the rest with random characters
    const allChars = uppercaseChars + lowercaseChars + numberChars + specialChars;
    for (let i = 0; i < 6; i++) { // Add 6 more chars for a total of 10
      password += allChars.charAt(Math.floor(Math.random() * allChars.length));
    }
    
    // Shuffle the password
    return password.split('').sort(() => 0.5 - Math.random()).join('');
  };

  // Initiates the password generation process with authentication
  const initiatePasswordGeneration = () => {
    if (!selectedUser) return;
    
    // Set the pending action
    setPendingAction('generatePassword');
    // Open auth modal
    setShowAuthModal(true);
    // Reset any previous errors
    setAuthError("");
    setAdminPassword("");
  };

  // Actual password generation after authentication
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

  // Initiates the delete user process with authentication
  const initiateDeleteUser = () => {
    if (!selectedUser) return;
    
    // Cannot delete yourself
    const currentUserId = localStorage.getItem("userId");
    if (currentUserId === selectedUser.userId) {
      showNotification("You cannot delete your own account", "error");
      return;
    }
    
    // Set the pending action
    setPendingAction('deleteUser');
    // Open auth modal
    setShowAuthModal(true);
    // Reset any previous errors
    setAuthError("");
    setAdminPassword("");
  };

  // Opens the delete confirmation modal after authentication
  const showDeleteConfirmation = () => {
    setShowDeleteConfirmModal(true);
  };

  // Actual delete user function
  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`http://localhost:5000/users/${selectedUser.userId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to delete user");
      }
      
      // Remove user from the state
      const updatedUsers = users.filter(user => user.userId !== selectedUser.userId);
      setUsers(updatedUsers);
      
      // Select first user after deletion if available
      if (updatedUsers.length > 0) {
        setSelectedUser(updatedUsers[0]);
      } else {
        setSelectedUser(null);
      }
      
      // Close the confirmation modal
      setShowDeleteConfirmModal(false);
      
      showNotification("User deleted successfully", "success");
    } catch (err) {
      showNotification("Failed to delete user: " + err.message, "error");
    }
  };

  // Handle authentication for sensitive actions
  const handleAuthenticate = async (e) => {
    e.preventDefault();
    
    if (!adminPassword) {
      setAuthError("Password is required");
      return;
    }
    
    try {
      const token = localStorage.getItem("authToken");
      const currentUserEmail = localStorage.getItem("userEmail");
      
      // Make authentication request
      const response = await fetch("http://localhost:5000/authenticate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          email: currentUserEmail, 
          password: adminPassword 
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.authenticated) {
        setAuthError("Invalid password");
        return;
      }
      
      // Close the auth modal
      setShowAuthModal(false);
      setAdminPassword("");
      
      // Proceed with the pending action
      if (pendingAction === 'generatePassword') {
        handleGeneratePassword();
      } else if (pendingAction === 'deleteUser') {
        showDeleteConfirmation();
      }
      
    } catch (err) {
      setAuthError("Authentication failed: " + err.message);
    }
  };

  const togglePasswordEditMode = () => {
    // If switching to edit mode
    if (!isPasswordEditable) {
      setIsPasswordEditable(true);
      setIsCustomPassword(true);
    } else {
      // Switching back to generated password
      setIsPasswordEditable(false);
      setIsCustomPassword(false);
      // Restore the original generated password
      setNewUserData({
        ...newUserData,
        password: originalGeneratedPassword
      });
    }
  };

  const handleCreateNewUser = () => {
    // Generate a random password for the new user
    const randomPassword = generateRandomPassword();
    
    // Reset form data with generated password
    setNewUserData({
      email: "",
      username: "",
      password: randomPassword,
      role: "user"
    });
    
    // Store the original generated password
    setOriginalGeneratedPassword(randomPassword);
    
    // Reset custom password state
    setIsCustomPassword(false);
    setIsPasswordEditable(false);
    
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

    if (isCustomPassword) {
      const validation = validatePassword(newUserData.password);
      if (!validation.valid) {
        showNotification(validation.message, "error");
        return;
      }
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
          // Set mustChangePassword based on custom password setting
          mustChangePassword: !isCustomPassword,
          // Explicitly set the user as offline
          isOnline: false,
          lastSeen: new Date().toISOString()
        })
      });
      
      if (!response.ok) {
        throw new Error("Failed to create user");
      }
      
      const result = await response.json();
      
      // Add new user to state with explicit offline status
      const newUser = {
        ...result.user,
        mustChangePassword: !isCustomPassword,
        isOnline: false
      };
      
      setUsers([...users, newUser]);
      
      // Select newly created user
      setSelectedUser(newUser);
      
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
      
      // Check if the response indicates sessions were invalidated
      const data = await response.json();
      
      // Refresh user list to show updated data
      fetchUsers();
      
      // Update local storage if the current user was updated
      const currentUserId = localStorage.getItem("userId");
      if (currentUserId === selectedUser.userId) {
        // If the current user's data was changed, handle the session invalidation
        if (data.sessionInvalidated) {
          showNotification("Your account details have been changed. You will be logged out.", "info");
          
          // Wait 2 seconds then log out
          setTimeout(() => {
            handleLogout();
          }, 2000);
          return;
        }
        
        localStorage.setItem("username", formData.username || formData.email.split('@')[0]);
      }
      
      // Show success message
      showNotification("User updated successfully!", "success");
    } catch (err) {
      showNotification("Failed to update user: " + err.message, "error");
    }
  };
  
  // Handle logout
  const handleLogout = async () => {
    try {
      const token = localStorage.getItem("authToken");
      if (token) {
        // Call the logout endpoint
        await fetch("http://localhost:5000/logout", {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      // Clear all auth data from localStorage
      localStorage.removeItem("authToken");
      localStorage.removeItem("userEmail");
      localStorage.removeItem("userId");
      localStorage.removeItem("userRole");
      localStorage.removeItem("username");
      localStorage.removeItem("isAuthenticated");
      localStorage.removeItem("mustChangePassword");
      
      // Redirect to login page
      navigate("/login");
    }
  };

  const showNotification = (message, type = "info") => {
    if (type === "success") {
      toast.showSuccess(message);
    } else if (type === "error") {
      toast.showError(message);
    } else if (type === "warning") {
      toast.showWarning(message);
    } else {
      toast.showInfo(message);
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

  // SVG icons for buttons
  const PencilIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z"></path>
    </svg>
  );

  const RefreshIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
      <path d="M21 3v5h-5"></path>
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
      <path d="M3 21v-5h5"></path>
    </svg>
  );

  // Search Icon for search inputs
  const SearchIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="search-icon">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
  );

  // Exclamation Icon for password warning
  const ExclamationIcon = () => (
    <span className="password-warning">!</span>
  );

  return (
    <LoadingSpinner isLoading={loading}>
      <div className="user-management-container">
        <div className="page-header">
          <h1>User Management</h1>
          <div className="page-actions">
            <button className="action-btn" onClick={handleCreateNewUser}>
              + New User
            </button>
          </div>
        </div>
        
        <div className="user-management-grid">
          {/* Users list card */}
          <div className="dashboard-card users-list-card">
            <h3>Users</h3>
            
            {/* Search bar for users */}
            <div className="search-container">
              <div className="search-input-wrapper">
                <SearchIcon />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
            </div>
            
            <div className="users-list-container">
              {filteredUsers.length === 0 ? (
                userSearchTerm ? (
                  <p className="no-results">No users found matching "{userSearchTerm}"</p>
                ) : (
                  <p>No users found</p>
                )
              ) : (
                <ul className="users-select-list">
                  {filteredUsers.map((user) => (
                    <li 
                      key={user.userId} 
                      onClick={() => handleUserSelect(user)}
                      className={selectedUser && selectedUser.userId === user.userId ? "selected" : ""}
                    >
                      <div className="user-list-item">
                        <div className="user-info">
                          <span className="user-email">{user.email}</span>
                          <div className="user-meta">
                            <span className="user-role">{user.role || "user"}</span>
                            <span className="online-status">
                              <span className={`status-indicator ${user.isOnline ? 'online' : 'offline'}`}></span>
                              {user.isOnline ? 'Online' : `Last seen: ${formatLastSeen(user.lastSeen)}`}
                            </span>
                            {user.mustChangePassword && <ExclamationIcon />}
                          </div>
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
            <div className="card-header-with-actions">
              <h3>Edit User</h3>
              {selectedUser && (
                <button 
                  className="action-btn assign-projects-btn"
                  onClick={handleOpenProjectAssignModal}
                >
                  Manage this user's Projects
                </button>
              )}
            </div>
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
                
                <div className="user-details">
                  <div className="user-id">User ID: {selectedUser.userId}</div>
                  <div className="user-created">Created: {selectedUser.createdAt}</div>
                </div>
                
                <div className="form-actions">
                  <div className="action-buttons-left">
                    <button type="submit" className="action-btn save-btn">
                      Save Changes
                    </button>
                    <button 
                      type="button" 
                      className="action-btn password-btn"
                      onClick={initiatePasswordGeneration}
                    >
                      Generate New Password
                    </button>
                  </div>
                  <button
                    type="button"
                    className="action-btn delete-btn"
                    onClick={initiateDeleteUser}
                  >
                    Delete User
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
              <div className="modal-password-display">
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
                  <div className={`password-display-container ${isPasswordEditable ? 'editable' : ''}`}>
                    {isPasswordEditable ? (
                      <input
                        type="text"
                        id="new-password"
                        name="password"
                        value={newUserData.password}
                        onChange={handleNewUserInputChange}
                        className="custom-password"
                        required
                      />
                    ) : (
                      <div className="password-display">
                        {newUserData.password}
                      </div>
                    )}
                    <button 
                      type="button" 
                      className="edit-password-btn"
                      onClick={togglePasswordEditMode}
                      title={isPasswordEditable ? "Use generated password" : "Set custom password"}
                    >
                      {isPasswordEditable ? <RefreshIcon /> : <PencilIcon />}
                    </button>
                  </div>
                  
                  <div className="form-help">
                    {isCustomPassword ? 
                      <div>
                      <p className="password-requirements-title" >Password requirements:</p>
                        <ul>
                          <li className="password-requirements">Must be 8 characters long</li>
                          <li className="password-requirements">Must have special character(s) or uppercase and lowercase characters</li>
                          <li className="password-requirements">Must have at least one number</li>
                        </ul>
                      </div> : 
                      "The user will be required to change this password on first login."}
                  </div>
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

        {/* Authentication Modal */}
        {showAuthModal && (
          <div className="modal-backdrop">
            <div className="modal-content">
              <h3>Authentication Required</h3>
              <p>
                Please enter your password to continue with this action.
              </p>
              
              <form onSubmit={handleAuthenticate} className="auth-form">
                {authError && <div className="auth-error">{authError}</div>}
                
                <div className="form-group">
                  <label htmlFor="admin-password">Your Password</label>
                  <input
                    type="password"
                    id="admin-password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    required
                  />
                </div>
                
                <div className="form-actions">
                  <button type="submit" className="action-btn save-btn">
                    Authenticate
                  </button>
                  <button 
                    type="button" 
                    className="action-btn cancel-btn"
                    onClick={() => {
                      setShowAuthModal(false);
                      setPendingAction(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirmModal && (
          <div className="modal-backdrop">
            <div className="modal-content">
              <h3>Confirm Delete User</h3>
              <p>
                Are you sure you want to delete the user <strong>{selectedUser.email}</strong>?
              </p>
              <p className="warning-text">
                This action cannot be undone. All data associated with this user will be permanently deleted.
              </p>
              
              <div className="form-actions">
                <button 
                  className="action-btn delete-btn"
                  onClick={handleDeleteUser}
                >
                  Delete User
                </button>
                <button 
                  className="action-btn cancel-btn"
                  onClick={() => setShowDeleteConfirmModal(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Project Assignment Modal */}
        {showProjectAssignModal && (
          <div className="modal-backdrop">
            <div className="modal-content project-assignment-modal">
              <h3>Assign Projects to {selectedUser.username || selectedUser.email}</h3>
              
              {/* Project search bar */}
              <div className="search-container">
                <div className="search-input-wrapper">
                  <SearchIcon />
                  <input
                    type="text"
                    placeholder="Search projects..."
                    value={projectSearchTerm}
                    onChange={(e) => setProjectSearchTerm(e.target.value)}
                    className="search-input"
                  />
                </div>
              </div>
              
              {isLoadingProjects ? (
                <div className="loading-indicator">Loading projects...</div>
              ) : filteredProjects.length === 0 ? (
                projectSearchTerm ? (
                  <p className="no-results">No projects found matching "{projectSearchTerm}"</p>
                ) : (
                  <p>No projects available to assign</p>
                )
              ) : (
                <>
                  <p className="modal-instruction">
                    Select the projects you want to assign to this user:
                  </p>
                  <div className="projects-list-container assignment-list">
                    <ul className="project-assignment-list">
                      {filteredProjects.map(project => (
                        <li key={project.projectId} className="project-assignment-item">
                          <label className="project-checkbox-label">
                            <input
                              type="checkbox"
                              checked={assignedProjects.includes(project.projectId)}
                              onChange={() => toggleProjectAssignment(project.projectId)}
                            />
                            <span className="project-assignment-name">{project.projectName}</span>
                            {project.company && (
                              <span className="project-assignment-company">{project.company}</span>
                            )}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
              
              <div className="modal-actions">
                <button 
                  className="action-btn cancel-btn"
                  onClick={() => setShowProjectAssignModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </LoadingSpinner>
  );
};

export default UserManagement;
import React, { useState, useEffect, useRef } from 'react';
import './AccountSwitcher.css';
import accountsData from './accounts.json';

// Custom hook for draggable elements
const useDraggable = (initialPosition = { y: 70 }) => {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ y: 0 });
  
  // Load saved position from localStorage
  useEffect(() => {
    const savedPosition = localStorage.getItem('accountSwitcherPosition');
    if (savedPosition) {
      try {
        setPosition(JSON.parse(savedPosition));
      } catch (e) {
        console.error('Error parsing saved position', e);
      }
    }
  }, []);
  
  // Save position to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('accountSwitcherPosition', JSON.stringify(position));
  }, [position]);
  
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ y: e.clientY });
  };
  
  const handleMouseMove = (e) => {
    if (!isDragging) return;
    
    // Calculate new position (only vertical)
    const deltaY = e.clientY - dragStart.y;
    const newPosition = { y: position.y + deltaY };
    
    // Constrain to viewport
    const viewportHeight = window.innerHeight;
    if (newPosition.y < 0) newPosition.y = 0;
    if (newPosition.y > viewportHeight - 100) newPosition.y = viewportHeight - 100;
    
    setPosition(newPosition);
    setDragStart({ y: e.clientY });
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
  };
  
  return {
    position,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    isDragging
  };
};

const AccountSwitcher = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentAccount, setCurrentAccount] = useState(null);
  const [accounts, setAccounts] = useState(accountsData.accounts || []);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [activeMenu, setActiveMenu] = useState(null);
  const dropdownRef = useRef(null);
  const contextMenuRef = useRef(null);
  
  // Use the draggable hook
  const {
    position,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    isDragging
  } = useDraggable();

  // Save accounts to localStorage
  const saveAccounts = (updatedAccounts) => {
    try {
      localStorage.setItem('savedAccounts', JSON.stringify(updatedAccounts));
    } catch (e) {
      console.error('Error saving accounts', e);
    }
  };
  
  // Load accounts from localStorage on mount
  useEffect(() => {
    const savedAccounts = localStorage.getItem('savedAccounts');
    if (savedAccounts) {
      try {
        setAccounts(JSON.parse(savedAccounts));
      } catch (e) {
        console.error('Error parsing saved accounts', e);
        // If error, fallback to accounts.json
        setAccounts(accountsData.accounts || []);
        saveAccounts(accountsData.accounts || []);
      }
    } else {
      // If no saved accounts yet, use the ones from accounts.json
      setAccounts(accountsData.accounts || []);
      saveAccounts(accountsData.accounts || []);
    }
  }, []);
  
  // Add event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);
  
  // Check if user is logged in
  useEffect(() => {
    const checkCurrentUser = () => {
      const token = localStorage.getItem('authToken');
      const email = localStorage.getItem('userEmail');
      const username = localStorage.getItem('username');
      const userId = localStorage.getItem('userId');
      const userRole = localStorage.getItem('userRole');
      
      if (token && email) {
        setCurrentAccount({
          email,
          username: username || email.split('@')[0],
          userId,
          role: userRole || 'user'
        });
      } else {
        setCurrentAccount(null);
      }
    };
    
    checkCurrentUser();
    
    // Check for login/logout events
    window.addEventListener('storage', checkCurrentUser);
    return () => window.removeEventListener('storage', checkCurrentUser);
  }, []);
  
  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Close main dropdown if clicking outside
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }

      // Close context menu if clicking outside
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target)) {
        // Only close if the click wasn't on a dots button
        if (!event.target.closest('.menu-toggle')) {
          setActiveMenu(null);
        }
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Switch to another account
  const switchToAccount = async (account) => {
    try {
      // Log out the current user first
      localStorage.removeItem('authToken');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('userId');
      localStorage.removeItem('userRole');
      localStorage.removeItem('username');
      localStorage.removeItem('isAuthenticated');
      
      // Send login request
      const response = await fetch("http://localhost:5000/authenticate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          email: account.email, 
          password: account.password 
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.authenticated) {
        // Failed to auto-login, redirect to login page
        sessionStorage.setItem('switchToAccount', JSON.stringify(account));
        window.location.href = '/login';
        return;
      }
      
      // Login successful, store user info
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("userEmail", data.user.email);
      localStorage.setItem("userId", data.user.userId);
      localStorage.setItem("userRole", data.user.role || "user");
      localStorage.setItem("username", data.user.username || data.user.email.split('@')[0]);
      localStorage.setItem("isAuthenticated", "true");
      
      // Refresh the page to update UI
      window.location.href = '/';
    } catch (error) {
      console.error('Login error:', error);
      // Fallback to manual login
      sessionStorage.setItem('switchToAccount', JSON.stringify(account));
      window.location.href = '/login';
    }
    
    setIsOpen(false);
  };

  // Edit account
  const openEditModal = (account) => {
    setEditingAccount({ ...account });
    setShowEditModal(true);
    setActiveMenu(null);
  };

  // Delete account
  const openDeleteConfirm = (account) => {
    setEditingAccount({ ...account });
    setShowDeleteConfirm(true);
    setActiveMenu(null);
  };

  // Delete account confirmation
  const deleteAccount = () => {
    const updatedAccounts = accounts.filter(acc => acc.email !== editingAccount.email);
    setAccounts(updatedAccounts);
    saveAccounts(updatedAccounts);
    setShowDeleteConfirm(false);
    setEditingAccount(null);
  };

  // Save edited account
  const saveEditedAccount = (e) => {
    e.preventDefault();
    
    // Basic validation
    if (!editingAccount.email || !editingAccount.password || !editingAccount.username) {
      alert('All fields are required');
      return;
    }
    
    // Update existing account
    const updatedAccounts = accounts.map(acc => 
      acc.email === editingAccount.email ? editingAccount : acc
    );
    
    setAccounts(updatedAccounts);
    saveAccounts(updatedAccounts);
    setShowEditModal(false);
    setEditingAccount(null);
  };

  // Add new account
  const addNewAccount = (e) => {
    e.preventDefault();
    
    // Basic validation
    if (!editingAccount || !editingAccount.email || !editingAccount.password || !editingAccount.username) {
      alert('All fields are required');
      return;
    }
    
    // Check if account with this email already exists
    if (accounts.some(acc => acc.email === editingAccount.email)) {
      alert('An account with this email already exists');
      return;
    }
    
    // Add the new account
    const newAccount = {
      ...editingAccount,
      role: editingAccount.role || 'user'
    };
    
    const updatedAccounts = [...accounts, newAccount];
    setAccounts(updatedAccounts);
    saveAccounts(updatedAccounts);
    setShowAddModal(false);
    setEditingAccount(null);
  };

  // Open the add new account modal
  const openAddModal = () => {
    setEditingAccount({
      email: '',
      password: '',
      username: '',
      role: 'user'
    });
    setShowAddModal(true);
  };
  
  // Get initials for avatar
  const getInitials = (name) => {
    return name ? name.charAt(0).toUpperCase() : '?';
  };
  
  // Get background color based on user role
  const getAvatarColor = (role) => {
    switch (role) {
      case 'admin':
        return '#f85444';
      default:
        return '#ff9a3c';
    }
  };

  // Handle input changes for the editing form
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditingAccount({
      ...editingAccount,
      [name]: value
    });
  };

  // Toggle the context menu for an account
  const toggleContextMenu = (e, accountEmail) => {
    e.stopPropagation();
    e.preventDefault();
    setActiveMenu(activeMenu === accountEmail ? null : accountEmail);
  };

  // Get the fixed position for the context menu
  const getContextMenuPosition = (accountEmail) => {
    if (activeMenu !== accountEmail) return {};
    
    const accountElement = document.querySelector(`[data-account="${accountEmail}"]`);
    
    if (!accountElement) return { top: 0, right: '100%' };
    
    const rect = accountElement.getBoundingClientRect();
    const dropdownRect = dropdownRef.current.getBoundingClientRect();
    
    // Calculate position relative to the viewport
    return {
      position: 'fixed',
      top: `${rect.top}px`,
      left: `${dropdownRect.left - 120}px`, // Position to the left of the account switcher
    };
  };
  
  return (
    <div 
      className="account-switcher-container" 
      ref={dropdownRef}
      style={{ top: `${position.y}px` }}
    >
      <button 
        className="account-switcher-button"
        onClick={() => !isDragging && setIsOpen(!isOpen)}
        onMouseDown={handleMouseDown}
        title={isDragging ? "Drag to reposition" : "Account Switcher"}
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
      >
        {currentAccount ? (
          <div 
            className="avatar"
            style={{ backgroundColor: getAvatarColor(currentAccount.role) }}
          >
            {getInitials(currentAccount.username)}
          </div>
        ) : (
          <div className="avatar default-avatar">?</div>
        )}
      </button>
      
      {isOpen && (
        <div className="account-dropdown">
          <div className="dropdown-header">
            <h3>Quick Login</h3>
          </div>
          
          {currentAccount && (
            <div className="current-account">
              <div 
                className="avatar"
                style={{ backgroundColor: getAvatarColor(currentAccount.role) }}
              >
                {getInitials(currentAccount.username)}
              </div>
              <div className="account-info">
                <div className="account-name">{currentAccount.username}</div>
                <div className="account-email">{currentAccount.email}</div>
              </div>
              <div className="account-badge">Current</div>
            </div>
          )}
          
          <div className="saved-accounts">
            <div className="section-header">
              <div className="section-title">Accounts</div>
              <button className="add-account-btn" onClick={openAddModal}>+ Add</button>
            </div>
            <ul className="accounts-list">
              {accounts.map((account) => (
                <li key={account.email} className="account-item" data-account={account.email}>
                  <div 
                    className="avatar"
                    style={{ backgroundColor: getAvatarColor(account.role) }}
                  >
                    {getInitials(account.username)}
                  </div>
                  <div 
                    className="account-info"
                    onClick={() => switchToAccount(account)}
                  >
                    <div className="account-name">{account.username}</div>
                    <div className="account-email">{account.email}</div>
                  </div>
                  <button 
                    className="menu-toggle"
                    onClick={(e) => toggleContextMenu(e, account.email)}
                    aria-label="Account options"
                  >
                    <span className="dots">&#8942;</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          
          <div className="dropdown-footer">
            <button 
              className="close-btn"
              onClick={() => setIsOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Context Menu - Rendered outside the scrollable area */}
      {activeMenu && (
        <div 
          className="account-context-menu"
          style={getContextMenuPosition(activeMenu)}
          ref={contextMenuRef}
        >
          <ul>
            <li onClick={() => openEditModal(accounts.find(acc => acc.email === activeMenu))}>
              <span className="menu-icon">✏️</span> Edit Account
            </li>
            <li onClick={() => openDeleteConfirm(accounts.find(acc => acc.email === activeMenu))}>
              <span className="menu-icon">🗑️</span> Delete Account
            </li>
          </ul>
        </div>
      )}

      {/* Edit Account Modal */}
      {showEditModal && editingAccount && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Edit Account</h3>
              <button 
                className="modal-close" 
                onClick={() => {
                  setShowEditModal(false);
                  setEditingAccount(null);
                }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={saveEditedAccount}>
              <div className="form-group">
                <label>Email</label>
                <input 
                  type="email"
                  name="email"
                  value={editingAccount.email}
                  readOnly
                  className="form-input"
                />
                <p className="form-help">Email address cannot be changed</p>
              </div>
              
              <div className="form-group">
                <label>Username</label>
                <input 
                  type="text"
                  name="username"
                  value={editingAccount.username}
                  onChange={handleInputChange}
                  className="form-input"
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Password</label>
                <input 
                  type="password"
                  name="password"
                  value={editingAccount.password}
                  onChange={handleInputChange}
                  className="form-input"
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Role</label>
                <select
                  name="role"
                  value={editingAccount.role}
                  onChange={handleInputChange}
                  className="form-select"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              
              <div className="modal-actions">
                <button type="submit" className="primary-btn">
                  Save Changes
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingAccount(null);
                  }}
                  className="secondary-btn"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Account Modal */}
      {showAddModal && editingAccount && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Add New Account</h3>
              <button 
                className="modal-close" 
                onClick={() => {
                  setShowAddModal(false);
                  setEditingAccount(null);
                }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={addNewAccount}>
              <div className="form-group">
                <label>Email</label>
                <input 
                  type="email"
                  name="email"
                  value={editingAccount.email}
                  onChange={handleInputChange}
                  className="form-input"
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Username</label>
                <input 
                  type="text"
                  name="username"
                  value={editingAccount.username}
                  onChange={handleInputChange}
                  className="form-input"
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Password</label>
                <input 
                  type="password"
                  name="password"
                  value={editingAccount.password}
                  onChange={handleInputChange}
                  className="form-input"
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Role</label>
                <select
                  name="role"
                  value={editingAccount.role}
                  onChange={handleInputChange}
                  className="form-select"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              
              <div className="modal-actions">
                <button type="submit" className="primary-btn">
                  Add Account
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingAccount(null);
                  }}
                  className="secondary-btn"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && editingAccount && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Delete Account</h3>
              <button 
                className="modal-close" 
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setEditingAccount(null);
                }}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete the account for <strong>{editingAccount.email}</strong>?</p>
              <p className="warning-text">This action cannot be undone.</p>
            </div>
            <div className="modal-actions">
              <button 
                onClick={deleteAccount}
                className="danger-btn"
              >
                Delete
              </button>
              <button 
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setEditingAccount(null);
                }}
                className="secondary-btn"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountSwitcher;
import { BrowserRouter as Router, Route, Routes, Navigate, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Login from "./pages/Login";
import UserManagement from "./pages/UserManagement";
import "./App.css"; // Make sure to create this file

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState("");
  const [loading, setLoading] = useState(true);
  
  // Check if user is already logged in on component mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem("authToken");
      if (token) {
        setIsAuthenticated(true);
        setUserRole(localStorage.getItem("userRole") || "user");
      }
      setLoading(false);
    };
    
    checkAuth();
  }, []);
  
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
      localStorage.removeItem("isAuthenticated");
      setIsAuthenticated(false);
      setUserRole("");
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <Router>
      <div className="app-container">
        {isAuthenticated && (
          <div className="header">
            <h2>GleeManager</h2>
            <div className="user-info">
              <span>Welcome, {localStorage.getItem("userEmail")}</span>
              <button className="logout-btn" onClick={handleLogout}>Logout</button>
            </div>
          </div>
        )}
        
        <Routes>
          <Route 
            path="/" 
            element={isAuthenticated ? (
              userRole === "admin" ? 
                <AdminHomePage /> : 
                <UserHomePage />
            ) : (
              <Navigate to="/login" replace />
            )} 
          />
          <Route 
            path="/login" 
            element={
              !isAuthenticated ? (
                <Login setIsAuthenticated={setIsAuthenticated} />
              ) : (
                <Navigate to="/" replace />
              )
            } 
          />
          <Route 
            path="/user-management" 
            element={
              isAuthenticated && userRole === "admin" ? (
                <UserManagement />
              ) : (
                <Navigate to="/" replace />
              )
            } 
            />
        </Routes>
      </div>
    </Router>
  );
}

// Admin Home Page Component
function AdminHomePage() {
  const navigate = useNavigate();

  return (
    <div className="home-page admin-home">
      <div className="dashboard-header">
        <h1>Admin Dashboard</h1>
        <div className="dashboard-actions">
          <button className="action-btn" onClick={() => navigate("/user-management")}>Manage Users</button>
          <button className="action-btn">System Settings</button>
        </div>
      </div>
      
      <div className="dashboard-grid">
        <div className="dashboard-card stats-card">
          <h3>System Statistics</h3>
          <div className="stats-content">
            <div className="stat-item">
              <span className="stat-label">Total Users</span>
              <span className="stat-value">243</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Active Today</span>
              <span className="stat-value">46</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">New This Week</span>
              <span className="stat-value">12</span>
            </div>
          </div>
        </div>
        
        <div className="dashboard-card">
          <h3>Recent Activity</h3>
          <ul className="activity-list">
            <li>User john@example.com logged in (2 min ago)</li>
            <li>New user registered: jane@example.com (15 min ago)</li>
            <li>Password reset for bob@example.com (1 hour ago)</li>
          </ul>
        </div>
      </div>
      
      <UsersList />
      
      <div className="role-indicator admin-role">
        Admin Access
      </div>
    </div>
  );
}

// User Home Page Component
function UserHomePage() {
  return (
    <div className="home-page user-home">
      <div className="dashboard-header">
        <h1>Welcome to GleeManager</h1>
        <div className="dashboard-actions">
          <button className="action-btn">My Profile</button>
          <button className="action-btn">Help</button>
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
              <span className="stat-value">3 days</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Last Login</span>
              <span className="stat-value">Today</span>
            </div>
          </div>
        </div>
      </div>
      
      <UsersList />
      
      <div className="role-indicator user-role">
        Standard User
      </div>
    </div>
  );
}

// Component to fetch and display users
function UsersList() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
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
            // Handle unauthorized (invalid/expired token)
            localStorage.removeItem("authToken");
            localStorage.removeItem("isAuthenticated");
            window.location.href = "/login";
            throw new Error("Your session has expired. Please log in again.");
          }
          throw new Error("Failed to fetch users");
        }
        
        const data = await response.json();
        setUsers(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchUsers();
  }, []);

  if (loading) return <div className="loading-indicator">Loading users...</div>;
  if (error) return <div className="error-message">Error: {error}</div>;

  return (
    <div className="users-list">
      <h2>Users in Database</h2>
      {users.length === 0 ? (
        <p>No users found</p>
      ) : (
        <div className="users-table-container">
          <table className="users-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Created</th>
                <th>Role</th>
                <th>User ID</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, index) => (
                <tr key={user.userId || index}>
                  <td>{user.email}</td>
                  <td>{new Date(user.createdAt).toLocaleString()}</td>
                  <td>{user.role || "user"}</td>
                  <td className="user-id">{user.userId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
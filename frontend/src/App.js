import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Login from "./pages/Login";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Check if user is already logged in on component mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem("authToken");
      if (token) {
        // You could validate the token here with your server
        setIsAuthenticated(true);
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
      localStorage.removeItem("isAuthenticated");
      setIsAuthenticated(false);
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
              <div className="home-page">
                <h1>Home Page</h1>
                <UsersList />
              </div>
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
        </Routes>
      </div>
    </Router>
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

  if (loading) return <div>Loading users...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="users-list">
      <h2>Users in Database</h2>
      {users.length === 0 ? (
        <p>No users found</p>
      ) : (
        <ul>
          {users.map((user, index) => (
            <li key={user.userId || index}>
              <strong>Email:</strong> {user.email} | <strong>Created:</strong> {new Date(user.createdAt).toLocaleString()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default App;
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Login from "./pages/Login/Login";
import AdminDashboard from "./pages/Dashboard/AdminDashboard";
import UserDashboard from "./pages/Dashboard/UserDashboard";
import UserManagement from "./pages/UserManagement/UserManagement";
import BaseLayout from "./components/Layout/BaseLayout";
import "./App.css";

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
      localStorage.removeItem("username");
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
      <Routes>
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
        
        {/* Protected routes wrapped in BaseLayout */}
        <Route 
          path="/" 
          element={
            isAuthenticated ? (
              <BaseLayout userRole={userRole} handleLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        >
          {/* Dashboard route - renders different dashboard based on role */}
          <Route 
            index
            element={
              userRole === "admin" ? <AdminDashboard /> : <UserDashboard />
            } 
          />
          
          {/* Admin-only routes */}
          <Route 
            path="user-management" 
            element={
              userRole === "admin" ? (
                <UserManagement />
              ) : (
                <Navigate to="/" replace />
              )
            } 
          />
          
          {/* Add more routes as needed */}
          <Route path="profile" element={<div>Profile Page Coming Soon</div>} />
          <Route path="settings" element={<div>Settings Page Coming Soon</div>} />
          <Route path="help" element={<div>Help Page Coming Soon</div>} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
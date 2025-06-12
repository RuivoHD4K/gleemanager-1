import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import { useState, useEffect, Suspense, lazy } from "react";
import BaseLayout from "./components/Layout/BaseLayout";
import { ToastProvider } from "./components/Toast/ToastContext";
import "./App.css";

// Lazy load all page components
const Login = lazy(() => import("./pages/Login/Login"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard/AdminDashboard"));
const UserDashboard = lazy(() => import("./pages/UserDashboard/UserDashboard"));
const UserManagement = lazy(() => import("./pages/UserManagement/UserManagement"));
const ProjectManagement = lazy(() => import("./pages/ProjectManagement/ProjectManagement"));
const RouteManagement = lazy(() => import("./pages/RouteManagement/RouteManagement"));
const ChangePassword = lazy(() => import("./pages/ChangePassword/ChangePassword"));
const ExcelTemplates = lazy(() => import("./pages/ExcelTemplates/ExcelTemplates"));
const CompanyManagement = lazy(() => import("./pages/CompanyManagement/CompanyManagement"));
const HolidayCalendar = lazy(() => import("./pages/HolidayCalendar/HolidayCalendar"));

// Create a dynamic Profile component that loads CSS separately
const Profile = lazy(() => 
  import("./pages/Profile/Profile").then(module => {
    // This ensures the CSS is only loaded when Profile is actually rendered
    return { default: module.default };
  })
);

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState("");
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Check if user is already logged in on component mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem("authToken");
      if (token) {
        setIsAuthenticated(true);
        setUserRole(localStorage.getItem("userRole") || "user");
        
        // Check if user must change password - IMPORTANT: Convert string to boolean
        const mustChange = localStorage.getItem("mustChangePassword") === "true";
        console.log("Must change password:", mustChange); // Debug log
        setMustChangePassword(mustChange);
      }
      setLoading(false);
    };
    
    checkAuth();
  }, []);

  // Set up window beforeunload event to mark user as offline when they close tab/browser
  useEffect(() => {
    const handleTabClose = () => {
      if (isAuthenticated) {
        const userId = localStorage.getItem("userId");
        const token = localStorage.getItem("authToken");
        
        if (userId && token) {
          // Use navigator.sendBeacon for more reliable delivery in beforeunload events
          const url = `http://localhost:5000/offline?userId=${userId}&token=${token}`;
          navigator.sendBeacon(url);
        }
      }
    };
    
    // Set up ping interval to update online status
    let pingInterval;
    if (isAuthenticated) {
      // Initial ping
      sendPing();
      
      // Set up regular ping every 30 seconds
      pingInterval = setInterval(sendPing, 30000);
    }
    
    // Add event listener for tab/browser close
    window.addEventListener("beforeunload", handleTabClose);
    
    // Clean up on component unmount
    return () => {
      window.removeEventListener("beforeunload", handleTabClose);
      if (pingInterval) clearInterval(pingInterval);
    };
  }, [isAuthenticated]);
  
  // Function to send a ping to the server to update online status
  const sendPing = async () => {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) return;
      
      await fetch("http://localhost:5000/ping", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
    } catch (err) {
      console.error("Ping error:", err);
    }
  };
  
  const handleLogout = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const userId = localStorage.getItem("userId");
      
      if (token) {
        // First, mark the user as offline
        if (userId) {
          try {
            // Use fetch instead of sendBeacon for explicit logout
            await fetch(`http://localhost:5000/offline?userId=${userId}&token=${token}`, {
              method: "POST"
            });
          } catch (error) {
            console.error("Error setting offline status:", error);
          }
        }
        
        // Then call the logout endpoint
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
      setIsAuthenticated(false);
      setUserRole("");
      setMustChangePassword(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  // Debug log to help troubleshoot
  console.log("Auth state:", { isAuthenticated, userRole, mustChangePassword });

  return (
    <ToastProvider>
      <Router>
        <Suspense fallback={<div className="loading">Loading...</div>}>
          <Routes>
            <Route 
              path="/login" 
              element={
                !isAuthenticated ? (
                  <Login 
                    setIsAuthenticated={setIsAuthenticated} 
                    setUserRole={setUserRole}
                    setMustChangePassword={setMustChangePassword}
                  />
                ) : (
                  // If authenticated but needs to change password, redirect to change password
                  mustChangePassword ? (
                    <Navigate to="/change-password" replace />
                  ) : (
                    <Navigate to="/" replace />
                  )
                )
              } 
            />
            
            {/* Change Password route */}
            <Route
              path="/change-password"
              element={
                isAuthenticated ? (
                  <ChangePassword setMustChangePassword={setMustChangePassword} />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            
            {/* Protected routes wrapped in BaseLayout */}
            <Route 
              path="/" 
              element={
                isAuthenticated ? (
                  // If user must change password, redirect to change password page
                  mustChangePassword ? (
                    <Navigate to="/change-password" replace />
                  ) : (
                    <BaseLayout userRole={userRole} handleLogout={handleLogout} />
                  )
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
              
              {/* Project Management route - admin only */}
              <Route 
                path="project-management" 
                element={
                  userRole === "admin" ? (
                    <ProjectManagement />
                  ) : (
                    <Navigate to="/" replace />
                  )
                } 
              />
              
              {/* Route Management route - admin only */}
              <Route 
                path="route-management" 
                element={
                  userRole === "admin" ? (
                    <RouteManagement />
                  ) : (
                    <Navigate to="/" replace />
                  )
                } 
              />
              
              {/* Company Management route - admin only */}
              <Route 
                path="company-management" 
                element={
                  userRole === "admin" ? (
                    <CompanyManagement />
                  ) : (
                    <Navigate to="/" replace />
                  )
                } 
              />

              {/* Excel Templates route - admin only */}
              <Route 
                path="excel-templates" 
                element={
                  userRole === "admin" ? (
                    <ExcelTemplates />
                  ) : (
                    <Navigate to="/" replace />
                  )
                } 
              />

              {/* User Dashboard route - accessible by all users */}
              <Route 
                path="user-dashboard" 
                element={<UserDashboard />} 
              />
              
              {/* Holiday Calendar route - accessible by all users */}
              <Route 
                path="holiday-calendar" 
                element={<HolidayCalendar />} 
              />
              
              {/* Profile route - accessible by all users */}
              <Route path="profile" element={<Profile />} />
              
              {/* Settings and Help routes */}
              <Route path="settings" element={<div>Settings Page Coming Soon</div>} />
              <Route path="help" element={<div>Help Page Coming Soon</div>} />
            </Route>
          </Routes>
        </Suspense>
      </Router>
    </ToastProvider>
  );
}

export default App;
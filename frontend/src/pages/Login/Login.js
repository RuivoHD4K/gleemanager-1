import React, { useState, useEffect } from "react";
import LoadingSpinner from "../../components/LoadingSpinner/LoadingSpinner";
import { useToast } from '../../components/Toast/ToastContext';
import "./Login.css";

const Login = ({ setIsAuthenticated, setUserRole, setMustChangePassword }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState("");
  const toast = useToast();

  // Check if we have a saved account to autofill and check for existing auth
  useEffect(() => {
    const checkAuthAndAutofill = async () => {
      setLoading(true);
      
      // Check if already authenticated
      const token = localStorage.getItem("authToken");
      if (token) {
        // Redirect will happen via the route config in App.js
        setIsAuthenticated(true);
        setUserRole(localStorage.getItem("userRole") || "user");
        setMustChangePassword(localStorage.getItem("mustChangePassword") === "true");
        return;
      }
      
      // Check for account to autofill
      const switchAccount = sessionStorage.getItem('switchToAccount');
      if (switchAccount) {
        try {
          const accountData = JSON.parse(switchAccount);
          setEmail(accountData.email || '');
          // Don't auto-fill password for security reasons
          // Just clear the session storage
          sessionStorage.removeItem('switchToAccount');
        } catch (e) {
          console.error('Error parsing account data', e);
          sessionStorage.removeItem('switchToAccount');
        }
      }
      
      // Simulate a brief loading period
      setTimeout(() => {
        setLoading(false);
      }, 500);
    };
    
    checkAuthAndAutofill();
  }, [setIsAuthenticated, setUserRole, setMustChangePassword]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("http://localhost:5000/authenticate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Authentication failed");
      }
      
      if (data.authenticated) {
        const userRole = data.user.role || "user";
        const mustChangePasswordFlag = data.user.mustChangePassword || false;
        
        // Store token and user info in localStorage
        localStorage.setItem("authToken", data.token);
        localStorage.setItem("userEmail", data.user.email);
        localStorage.setItem("userId", data.user.userId);
        localStorage.setItem("userRole", userRole);
        localStorage.setItem("username", data.user.username || data.user.email.split('@')[0]);
        localStorage.setItem("isAuthenticated", "true");
        localStorage.setItem("mustChangePassword", mustChangePasswordFlag.toString());
        
        toast.showSuccess("Login successful! Redirecting...");
        
        // Update authentication state, user role, and mustChangePassword state
        setTimeout(() => {
          setIsAuthenticated(true);
          setUserRole(userRole);
          setMustChangePassword(mustChangePasswordFlag);
        }, 1000);
      } else {
        toast.showError("Invalid email or password");
        setLoading(false);
      }
    } catch (err) {
      toast.showError("Authentication failed: " + err.message);
      setLoading(false);
    }
  };

  return (
    <LoadingSpinner isLoading={loading}>
      <div className="login-container">
        <div className="login-box">
          <div className="app-logo">
            <h1>GleeManager</h1>
            <p>Management made simple</p>
          </div>
          
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div className="form-group">
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div className="button-group">
              <button type="submit" disabled={loading}>
                {loading ? "Processing..." : "Login"}
              </button>
            </div>
          </form>
          <a href="#" className="forgot-password">Forgot Password?</a>
        </div>
      </div>
    </LoadingSpinner>
  );
};

export default Login;
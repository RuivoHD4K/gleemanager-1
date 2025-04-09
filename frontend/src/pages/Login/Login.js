import React, { useState, useEffect } from "react";
import "./Login.css";

const Login = ({ setIsAuthenticated, setUserRole, setMustChangePassword }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Check if we have a saved account to autofill
  useEffect(() => {
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
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccessMessage("");

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
        
        setSuccessMessage("Login successful! Redirecting...");
        
        // Update authentication state, user role, and mustChangePassword state
        setTimeout(() => {
          setIsAuthenticated(true);
          setUserRole(userRole);
          setMustChangePassword(mustChangePasswordFlag);
        }, 1000);
      } else {
        setError("Invalid email or password");
      }
    } catch (err) {
      setError("Authentication failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }
    
    // Basic password validation
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }
    
    setLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch("http://localhost:5000/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          createdAt: new Date().toISOString(),
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to create user");
      }
      
      const userRole = data.user.role || "user";
      const mustChangePasswordFlag = data.user.mustChangePassword || true; // New users should change password
      
      // Store token and user info
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("userEmail", data.user.email);
      localStorage.setItem("userId", data.user.userId);
      localStorage.setItem("userRole", userRole);
      localStorage.setItem("username", data.user.username || data.user.email.split('@')[0]);
      localStorage.setItem("isAuthenticated", "true");
      localStorage.setItem("mustChangePassword", mustChangePasswordFlag.toString());
      
      setSuccessMessage("Account created successfully! Redirecting...");
      
      // Update authentication state AND user role state
      setTimeout(() => {
        setIsAuthenticated(true);
        setUserRole(userRole);
        setMustChangePassword(mustChangePasswordFlag);
      }, 1000);
    } catch (err) {
      setError("Sign up failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="app-logo">
          <h1>GleeManager</h1>
          <p>Management made simple</p>
        </div>
        
        {error && <div className="notification error">{error}</div>}
        {successMessage && <div className="notification success">{successMessage}</div>}
        
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
            <button 
              type="button" 
              onClick={handleSignUp} 
              disabled={loading}
              className="signup-btn"
            >
              Sign Up
            </button>
          </div>
        </form>
        <a href="#" className="forgot-password">Forgot Password?</a>
      </div>
    </div>
  );
};

export default Login;
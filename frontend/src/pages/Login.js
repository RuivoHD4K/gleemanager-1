import { useState } from "react";
import "./Login.css";

const Login = ({ setIsAuthenticated }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

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
        // Store token and user info in localStorage
        localStorage.setItem("authToken", data.token);
        localStorage.setItem("userEmail", data.user.email);
        localStorage.setItem("userId", data.user.userId);
        localStorage.setItem("userRole", data.user.role || "user"); // Store user role
        localStorage.setItem("isAuthenticated", "true");
        
        // Update authentication state
        setIsAuthenticated(true);
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
      
      // Store token and user info
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("userEmail", data.user.email);
      localStorage.setItem("userId", data.user.userId);
      localStorage.setItem("userRole", data.user.role || "user"); // Store user role
      localStorage.setItem("isAuthenticated", "true");
      
      // Update authentication state
      setIsAuthenticated(true);
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
        
        {error && <p className="error-message">{error}</p>}
        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            required
          />
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
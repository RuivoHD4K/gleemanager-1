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
      // Use POST to authenticate user instead of GET
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
        // Store authentication status in localStorage
        localStorage.setItem("isAuthenticated", "true");
        localStorage.setItem("userEmail", email);
        
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
      
      // Auto login after sign up
      localStorage.setItem("isAuthenticated", "true");
      localStorage.setItem("userEmail", email);
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
        <h2>Login to GleeManager</h2>
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
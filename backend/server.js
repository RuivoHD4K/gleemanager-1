const http = require("http");
const { PutCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const dynamoDB = require("./database");
const crypto = require("crypto"); // Node.js built-in encryption library
const { v4: uuidv4 } = require("uuid"); // You'll need to install this: npm install uuid

// Encryption functions
function generateSalt() {
  return crypto.randomBytes(16).toString("hex");
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
}

function verifyPassword(storedHash, storedSalt, providedPassword) {
  const hash = hashPassword(providedPassword, storedSalt);
  return storedHash === hash;
}

// Generate a secure token for sessions
function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

// Simple in-memory token store (replace with a proper database in production)
const tokenStore = new Map();

const server = http.createServer((req, res) => {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  // Log all incoming requests for debugging
  console.log(`${req.method} ${req.url}`);

  // Extract authorization token from headers
  const authHeader = req.headers.authorization;
  let token = null;
  
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  }

  // Root endpoint
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Backend is running!" }));
  } 
  
  // Authentication endpoint
  else if (req.method === "POST" && req.url === "/authenticate") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", async () => {
      try {
        const credentials = JSON.parse(body);
        
        if (!credentials.email || !credentials.password) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Email and password are required" }));
        }
        
        // Fetch user with the provided email
        const params = new ScanCommand({
          TableName: "Users",
          FilterExpression: "email = :email",
          ExpressionAttributeValues: {
            ":email": credentials.email
          }
        });
        
        const result = await dynamoDB.send(params);
        
        if (!result.Items || result.Items.length === 0) {
          res.writeHead(401, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ 
            authenticated: false,
            error: "Invalid credentials"
          }));
        }
        
        const user = result.Items[0];
        
        // Verify the password using the stored hash and salt
        if (verifyPassword(user.passwordHash, user.salt, credentials.password)) {
          // Generate a new token
          const token = generateToken();
          const userId = user.userId || user.email;
          
          // Store the token with the user ID and expiration time (24 hours)
          tokenStore.set(token, {
            userId,
            expires: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
          });
          
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ 
            authenticated: true,
            token,
            user: {
              userId,
              email: user.email,
              createdAt: user.createdAt,
              role: user.role || "user" // Include the role in the response
            }
          }));
        } else {
          res.writeHead(401, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ 
            authenticated: false,
            error: "Invalid credentials"
          }));
        }
      } catch (err) {
        console.error("Authentication error:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  }
  
  // Create a new user
  else if (req.method === "POST" && req.url === "/users") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", async () => {
      try {
        const userData = JSON.parse(body);
        
        // Validate user input
        if (!userData.email || !userData.password) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Email and password are required" }));
        }
        
        // Check if user already exists
        const checkParams = new ScanCommand({
          TableName: "Users",
          FilterExpression: "email = :email",
          ExpressionAttributeValues: {
            ":email": userData.email
          }
        });
        
        const existingUsers = await dynamoDB.send(checkParams);
        
        if (existingUsers.Items && existingUsers.Items.length > 0) {
          res.writeHead(409, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "User already exists" }));
        }
        
        // Add timestamp if not provided
        if (!userData.createdAt) {
          userData.createdAt = new Date().toISOString();
        }
        
        // Generate unique user ID
        const userId = uuidv4();
        
        // Generate salt and hash the password
        const salt = generateSalt();
        const passwordHash = hashPassword(userData.password, salt);
        
        // Create the user object (without the plain password)
        // Add default role as "user"
        const user = {
          userId,
          email: userData.email,
          passwordHash,
          salt,
          createdAt: userData.createdAt,
          role: "user" // Default role for new users
        };
        
        const params = new PutCommand({
          TableName: "Users",
          Item: user,
        });

        await dynamoDB.send(params);

        // Generate a token for immediate login
        const token = generateToken();
        tokenStore.set(token, {
          userId,
          expires: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
        });

        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ 
          message: "User created successfully",
          token,
          user: { 
            userId,
            email: user.email,
            createdAt: user.createdAt,
            role: user.role // Include role in the response
          }
        }));
      } catch (err) {
        console.error("Error creating user:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } 
  
  // Get all users (protected route)
  else if (req.method === "GET" && req.url === "/users") {
    // Check if token is valid
    if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Unauthorized" }));
    }

    const params = new ScanCommand({ TableName: "Users" });

    dynamoDB.send(params)
      .then((data) => {
        // Remove sensitive fields from response
        const safeUsers = (data.Items || []).map(user => {
          const { passwordHash, salt, ...safeUser } = user;
          return safeUser;
        });
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(safeUsers));
      })
      .catch((err) => {
        console.error("Error fetching users:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      });
  }
  
  // Logout endpoint
  else if (req.method === "DELETE" && req.url === "/logout") {
    if (token && tokenStore.has(token)) {
      tokenStore.delete(token);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: "Logged out successfully" }));
    }
    
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "No active session" }));
  }

  // Update a user - FIXED VERSION
  else if (req.method === "PUT" && req.url.match(/^\/users\/[^\/]+$/)) {
    // Extract userId from URL
    const userId = req.url.split("/")[2];
    console.log("Update user request for userId:", userId);
    
    // Check if token is valid
    if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
      console.log("Authorization failed for token:", token);
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Unauthorized" }));
    }
    
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", async () => {
      try {
        const userData = JSON.parse(body);
        console.log("Update user data received:", userData);
        
        // First, get the existing user
        const getParams = new ScanCommand({
          TableName: "Users",
          FilterExpression: "userId = :userId",
          ExpressionAttributeValues: {
            ":userId": userId
          }
        });
        
        console.log("Looking for user with ID:", userId);
        const userResult = await dynamoDB.send(getParams);
        
        if (!userResult.Items || userResult.Items.length === 0) {
          console.log("User not found with ID:", userId);
          res.writeHead(404, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "User not found" }));
        }
        
        const existingUser = userResult.Items[0];
        console.log("Found existing user:", existingUser.email);
        
        // Update only allowed fields
        const updatedUser = {
          ...existingUser,
          email: userData.email || existingUser.email,
          username: userData.username || existingUser.username,
          role: userData.role || existingUser.role
        };
        
        console.log("Updating user to:", updatedUser);
        const updateParams = new PutCommand({
          TableName: "Users",
          Item: updatedUser
        });
        
        await dynamoDB.send(updateParams);
        console.log("User updated successfully");
        
        // Remove sensitive fields from response
        const { passwordHash, salt, ...safeUser } = updatedUser;
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(safeUser));
      } catch (err) {
        console.error("Error updating user:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  }
  
  // Update user password - FIXED VERSION
  else if (req.method === "PUT" && req.url.match(/^\/users\/[^\/]+\/password$/)) {
    // Extract userId from URL
    const userId = req.url.split("/")[2];
    console.log("Password update request for userId:", userId);
    
    // Check if token is valid
    if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
      console.log("Authorization failed for token:", token);
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Unauthorized" }));
    }
    
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", async () => {
      try {
        const passwordData = JSON.parse(body);
        
        if (!passwordData.password) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Password is required" }));
        }
        
        // Get the existing user
        const getParams = new ScanCommand({
          TableName: "Users",
          FilterExpression: "userId = :userId",
          ExpressionAttributeValues: {
            ":userId": userId
          }
        });
        
        console.log("Looking for user with ID:", userId);
        const userResult = await dynamoDB.send(getParams);
        
        if (!userResult.Items || userResult.Items.length === 0) {
          console.log("User not found with ID:", userId);
          res.writeHead(404, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "User not found" }));
        }
        
        const user = userResult.Items[0];
        console.log("Found user for password update:", user.email);
        
        // Generate new salt and hash for the password
        const salt = generateSalt();
        const passwordHash = hashPassword(passwordData.password, salt);
        
        // Update the user with new password hash and salt
        const updatedUser = {
          ...user,
          passwordHash,
          salt
        };
        
        console.log("Updating password for user:", user.email);
        const updateParams = new PutCommand({
          TableName: "Users",
          Item: updatedUser
        });
        
        await dynamoDB.send(updateParams);
        console.log("Password updated successfully");
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Password updated successfully" }));
      } catch (err) {
        console.error("Error updating password:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  }
  
  // 404 Not Found for all other routes
  else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Not Found" }));
  }
});

// Clean up expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of tokenStore.entries()) {
    if (session.expires < now) {
      tokenStore.delete(token);
    }
  }
}, 3600000); // Run every hour

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
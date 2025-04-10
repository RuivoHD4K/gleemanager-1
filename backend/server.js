const http = require("http");
const { PutCommand, ScanCommand, DeleteCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const dynamoDB = require("./database");
const crypto = require("crypto"); // Node.js built-in encryption library
const { v4: uuidv4 } = require("uuid"); // You'll need to install this: npm install uuid
const fs = require("fs");
const path = require("path");

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

// Session storage file path
const SESSION_FILE_PATH = path.join(__dirname, "sessions.json");

// Online users tracking
const onlineUsers = new Map();

// Token store with persistence
let tokenStore = new Map();

// Load sessions from disk on startup
try {
  if (fs.existsSync(SESSION_FILE_PATH)) {
    const sessionsData = JSON.parse(fs.readFileSync(SESSION_FILE_PATH, 'utf8'));
    // Convert the plain object back to a Map
    tokenStore = new Map(Object.entries(sessionsData).map(([token, session]) => {
      // Convert the expiration time back from string to number
      return [token, { ...session, expires: parseInt(session.expires) }];
    }));
    
    console.log(`Loaded ${tokenStore.size} sessions from disk`);
    
    // Filter out expired sessions
    const now = Date.now();
    for (const [token, session] of tokenStore.entries()) {
      if (session.expires < now) {
        tokenStore.delete(token);
      }
    }
    console.log(`${tokenStore.size} valid sessions after filtering expired ones`);
  }
} catch (error) {
  console.error("Error loading sessions from disk:", error);
  // Continue with empty token store
  tokenStore = new Map();
}

// Function to save sessions to disk
function saveSessionsToDisk() {
  try {
    // Convert Map to a plain object for JSON serialization
    const sessionsObject = Object.fromEntries(tokenStore);
    fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify(sessionsObject));
    console.log(`Saved ${tokenStore.size} sessions to disk`);
  } catch (error) {
    console.error("Error saving sessions to disk:", error);
  }
}

// Update online status for a user
function updateOnlineStatus(userId, isOnline) {
  onlineUsers.set(userId, {
    isOnline,
    lastUpdated: new Date().toISOString()
  });
}

// Server shutdown handler to save sessions
process.on('SIGINT', () => {
  console.log('Server shutting down...');
  saveSessionsToDisk();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Server shutting down...');
  saveSessionsToDisk();
  process.exit(0);
});

// Ping endpoint for heartbeat to keep track of online users
const handlePing = (req, res, token) => {
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  const userId = tokenStore.get(token).userId;
  
  // Update user's online status
  updateOnlineStatus(userId, true);
  
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "online" }));
};

// Set user as offline endpoint
const handleSetOffline = (req, res) => {
  // Parse query parameters
  const url = new URL(req.url, `http://${req.headers.host}`);
  const userId = url.searchParams.get('userId');
  const token = url.searchParams.get('token');
  
  // Basic validation
  if (!userId || !token) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Missing userId or token" }));
  }
  
  // Check if token is valid for this user
  let isValidToken = false;
  for (const [storedToken, session] of tokenStore.entries()) {
    if (storedToken === token && session.userId === userId) {
      isValidToken = true;
      break;
    }
  }
  
  if (!isValidToken) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  // Update user's online status
  updateOnlineStatus(userId, false);
  
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "offline" }));
};

// Get online users endpoint
const handleGetOnlineUsers = (req, res, token) => {
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  const onlineUsersArray = Array.from(onlineUsers.entries()).map(([userId, status]) => ({
    userId,
    isOnline: status.isOnline,
    lastUpdated: status.lastUpdated
  }));
  
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(onlineUsersArray));
};

// Invalidate user sessions
const invalidateUserSessions = (userId) => {
  // Find all tokens for this user and remove them
  for (const [token, session] of tokenStore.entries()) {
    if (session.userId === userId) {
      console.log(`Invalidating session for user ${userId}`);
      tokenStore.delete(token);
    }
  }
  
  // Remove from online users
  onlineUsers.delete(userId);
  
  // Save updated sessions to disk
  saveSessionsToDisk();
};

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
  
  // Ping endpoint for heartbeat to track online users
  else if (req.method === "POST" && req.url === "/ping") {
    handlePing(req, res, token);
  }
  
  // Set user as offline endpoint - handles both POST and GET for easier browser integration
  else if ((req.method === "POST" || req.method === "GET") && req.url.startsWith("/offline")) {
    handleSetOffline(req, res);
  }
  
  // Get online users endpoint
  else if (req.method === "GET" && req.url === "/online-users") {
    handleGetOnlineUsers(req, res, token);
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
          
          // Store the token with the user ID and expiration time (24 hours)
          tokenStore.set(token, {
            userId: user.userId,
            expires: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
          });
          
          // Save session to disk after adding a new session
          saveSessionsToDisk();
          
          // Mark user as online
          updateOnlineStatus(user.userId, true);
          
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ 
            authenticated: true,
            token,
            user: {
              userId: user.userId,
              email: user.email,
              username: user.username,
              createdAt: user.createdAt,
              role: user.role || "user", // Include the role in the response
              mustChangePassword: user.mustChangePassword || false // Include flag in response
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
        // Add default role as "user" and set mustChangePassword flag to true
        const user = {
          userId,
          email: userData.email,
          passwordHash,
          salt,
          createdAt: userData.createdAt,
          username: userData.username || userData.email.split('@')[0],
          role: userData.role || "user", // Default role for new users
          mustChangePassword: userData.mustChangePassword !== undefined ? userData.mustChangePassword : true // Default to true if not specified
        };
        
        const params = new PutCommand({
          TableName: "Users",
          Item: user
        });

        await dynamoDB.send(params);

        // Generate a token for immediate login
        const token = generateToken();
        tokenStore.set(token, {
          userId,
          expires: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
        });
        
        // Save session to disk
        saveSessionsToDisk();
        
        // Mark user as online
        updateOnlineStatus(userId, true);

        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ 
          message: "User created successfully",
          token,
          user: { 
            userId,
            email: user.email,
            username: user.username,
            createdAt: user.createdAt,
            role: user.role, // Include role in the response
            mustChangePassword: user.mustChangePassword // Include flag in response
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
          
          // Add online status to each user
          const onlineStatus = onlineUsers.get(user.userId);
          return {
            ...safeUser,
            isOnline: onlineStatus ? onlineStatus.isOnline : false,
            lastSeen: onlineStatus ? onlineStatus.lastUpdated : null
          };
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
  
  // Get a single user by ID
  else if (req.method === "GET" && req.url.match(/^\/users\/[^\/]+$/)) {
    // Extract userId from URL
    const userId = req.url.split("/")[2];
    
    // Check if token is valid
    if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Unauthorized" }));
    }
    
    // Get user by primary key (userId)
    const params = new GetCommand({
      TableName: "Users",
      Key: {
        userId: userId
      }
    });
    
    dynamoDB.send(params)
      .then((data) => {
        if (!data.Item) {
          res.writeHead(404, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "User not found" }));
        }
        
        // Remove sensitive fields from response
        const { passwordHash, salt, ...safeUser } = data.Item;
        
        // Add online status to the user
        const onlineStatus = onlineUsers.get(userId);
        const userWithStatus = {
          ...safeUser,
          isOnline: onlineStatus ? onlineStatus.isOnline : false,
          lastSeen: onlineStatus ? onlineStatus.lastUpdated : null
        };
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(userWithStatus));
      })
      .catch((err) => {
        console.error("Error fetching user:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      });
  }
  
  // Logout endpoint
  else if (req.method === "DELETE" && req.url === "/logout") {
    if (token && tokenStore.has(token)) {
      const userId = tokenStore.get(token).userId;
      
      // Remove token from tokenStore
      tokenStore.delete(token);
      
      // Save updated sessions to disk
      saveSessionsToDisk();
      
      // Mark user as offline (if no other sessions exist for this user)
      const hasOtherSessions = Array.from(tokenStore.values()).some(session => session.userId === userId);
      if (!hasOtherSessions) {
        updateOnlineStatus(userId, false);
      }
      
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: "Logged out successfully" }));
    }
    
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "No active session" }));
  }

  // Update a user
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
        
        // First, get the existing user with GetCommand by primary key
        const getParams = new GetCommand({
          TableName: "Users",
          Key: {
            userId: userId
          }
        });
        
        console.log("Looking for user with ID:", userId);
        const userResult = await dynamoDB.send(getParams);
        
        if (!userResult.Item) {
          console.log("User not found with ID:", userId);
          res.writeHead(404, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "User not found" }));
        }
        
        const existingUser = userResult.Item;
        console.log("Found existing user:", existingUser.email);
        
        // Check if important details have changed
        const isSignificantChange = 
          userData.email !== existingUser.email || 
          userData.role !== existingUser.role;
        
        // Update only allowed fields
        const updatedUser = {
          ...existingUser,
          email: userData.email || existingUser.email,
          username: userData.username || existingUser.username,
          role: userData.role || existingUser.role,
          // Only update mustChangePassword if it's explicitly provided
          mustChangePassword: userData.mustChangePassword !== undefined 
            ? userData.mustChangePassword 
            : existingUser.mustChangePassword
        };
        
        console.log("Updating user to:", updatedUser);
        const updateParams = new PutCommand({
          TableName: "Users",
          Item: updatedUser
        });
        
        await dynamoDB.send(updateParams);
        console.log("User updated successfully");
        
        // If significant changes were made, invalidate all sessions for this user
        if (isSignificantChange) {
          console.log("Significant changes detected, invalidating user sessions");
          invalidateUserSessions(userId);
        }
        
        // Remove sensitive fields from response
        const { passwordHash, salt, ...safeUser } = updatedUser;
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ...safeUser,
          sessionInvalidated: isSignificantChange
        }));
      } catch (err) {
        console.error("Error updating user:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  }
  
  // Update user password
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
        
        // Get the existing user with GetCommand by primary key
        const getParams = new GetCommand({
          TableName: "Users",
          Key: {
            userId: userId
          }
        });
        
        console.log("Looking for user with ID:", userId);
        const userResult = await dynamoDB.send(getParams);
        
        if (!userResult.Item) {
          console.log("User not found with ID:", userId);
          res.writeHead(404, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "User not found" }));
        }
        
        const user = userResult.Item;
        console.log("Found user for password update:", user.email);
        
        // Check if this is a self-password change (user changing their own password)
        const isSelfChange = tokenStore.get(token).userId === userId;
        
        // Generate new salt and hash for the password
        const salt = generateSalt();
        const passwordHash = hashPassword(passwordData.password, salt);
        
        // Update the user with new password hash and salt
        // If it's an admin reset, set mustChangePassword to true
        // If it's a self-change, set mustChangePassword to false
        const updatedUser = {
          ...user,
          passwordHash,
          salt,
          mustChangePassword: isSelfChange ? false : true // Only set to false if user is changing their own password
        };
        
        console.log("Updating password for user:", user.email);
        const updateParams = new PutCommand({
          TableName: "Users",
          Item: updatedUser
        });
        
        await dynamoDB.send(updateParams);
        console.log("Password updated successfully");
        
        // Always invalidate sessions when password is changed, unless it's an admin resetting a password
        if (isSelfChange) {
          console.log("Password self-change, invalidating user sessions except current one");
          // Keep the current session but invalidate all others
          for (const [sessionToken, session] of tokenStore.entries()) {
            if (session.userId === userId && sessionToken !== token) {
              tokenStore.delete(sessionToken);
            }
          }
          saveSessionsToDisk();
        } else {
          // If admin is resetting a password, invalidate all of the user's sessions
          console.log("Admin password reset, invalidating all user sessions");
          invalidateUserSessions(userId);
        }
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ 
          message: "Password updated successfully",
          mustChangePassword: updatedUser.mustChangePassword,
          sessionsInvalidated: isSelfChange ? "partial" : "all"
        }));
      } catch (err) {
        console.error("Error updating password:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  }
  
  // Delete a user
  else if (req.method === "DELETE" && req.url.match(/^\/users\/[^\/]+$/)) {
    // Extract userId from URL
    const userId = req.url.split("/")[2];
    console.log("Delete user request for userId:", userId);
    
    // Check if token is valid
    if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
      console.log("Authorization failed for token:", token);
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Unauthorized" }));
    }
    
    // Prevent users from deleting their own account
    const currentUserId = tokenStore.get(token).userId;
    if (currentUserId === userId) {
      console.log("User attempted to delete their own account:", userId);
      res.writeHead(403, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "You cannot delete your own account" }));
    }

    // Handle request completely asynchronously
    (async () => {
      try {
        // Invalidate all sessions for this user before deletion
        invalidateUserSessions(userId);
        
        // Use DeleteCommand with userId as the primary key
        const deleteParams = new DeleteCommand({
          TableName: "Users",
          Key: {
            userId: userId
          }
        });
        
        await dynamoDB.send(deleteParams);
        console.log("User deleted successfully with ID:", userId);
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "User deleted successfully" }));
      } catch (err) {
        console.error("Error deleting user:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    })();
  }
  
  // 404 Not Found for all other routes
  else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Not Found" }));
  }
});

// Clean up expired tokens periodically and update online status
setInterval(() => {
  const now = Date.now();
  
  // Check for and remove expired tokens
  let expiredCount = 0;
  for (const [token, session] of tokenStore.entries()) {
    if (session.expires < now) {
      // Mark user as offline if this was their last session
      const userId = session.userId;
      const hasOtherSessions = Array.from(tokenStore.values())
        .filter(s => s !== session)
        .some(s => s.userId === userId);
      
      if (!hasOtherSessions) {
        updateOnlineStatus(userId, false);
      }
      
      tokenStore.delete(token);
      expiredCount++;
    }
  }
  
  if (expiredCount > 0) {
    console.log(`Cleaned up ${expiredCount} expired tokens`);
    saveSessionsToDisk();
  }
  
  // Mark users as offline if they haven't pinged in 2 minutes
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  for (const [userId, status] of onlineUsers.entries()) {
    if (status.isOnline && status.lastUpdated < twoMinutesAgo) {
      console.log(`User ${userId} marked as offline due to inactivity`);
      updateOnlineStatus(userId, false);
    }
  }
}, 60000); // Run every minute

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
const http = require("http");
const { PutCommand, ScanCommand, DeleteCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const dynamoDB = require("./database");
const crypto = require("crypto"); // Node.js built-in encryption library
const { v4: uuidv4 } = require("uuid"); // You'll need to install this: npm install uuid
const fs = require("fs");
const path = require("path");
const busboy = require('busboy'); // You'll need to install this: npm install busboy
const MAX_ACTIVITIES = 50;
const activityLog = [];

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

function formatDateTime(dateString) {
  if (!dateString) return null;
  
  let date;
  
  // If the dateString is already in DD/MM/YYYY format, we need to parse it correctly
  if (typeof dateString === 'string' && dateString.includes('/')) {
    // Check if it's in DD/MM/YYYY HH:MM format
    const dateTimeParts = dateString.split(' ');
    if (dateTimeParts.length >= 1) {
      const datePart = dateTimeParts[0];
      const timePart = dateTimeParts[1] || '00:00';
      
      // Parse DD/MM/YYYY
      const [day, month, year] = datePart.split('/');
      if (day && month && year) {
        // Create date in correct format (month is 0-indexed)
        date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        
        // If there's a time part, parse it
        if (timePart) {
          const [hours, minutes] = timePart.split(':');
          if (hours && minutes) {
            date.setHours(parseInt(hours), parseInt(minutes));
          }
        }
      } else {
        // Fallback to ISO parsing
        date = new Date(dateString);
      }
    } else {
      date = new Date(dateString);
    }
  } else {
    // Assume it's in ISO format or other standard format
    date = new Date(dateString);
  }
  
  // Check if the date is valid
  if (isNaN(date.getTime())) {
    return 'Invalid Date';
  }
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function formatDate(dateString) {
  if (!dateString) return null;
  
  let date;
  
  // If the dateString is already in DD/MM/YYYY format, parse it correctly
  if (typeof dateString === 'string' && dateString.includes('/')) {
    const [day, month, year] = dateString.split('/');
    if (day && month && year) {
      // Create date in correct format (month is 0-indexed)
      date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    } else {
      // Fallback to ISO parsing
      date = new Date(dateString);
    }
  } else {
    // Assume it's in ISO format or other standard format
    date = new Date(dateString);
  }
  
  // Check if the date is valid
  if (isNaN(date.getTime())) {
    return 'Invalid Date';
  }
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}/${month}/${year}`;
}

// Format user data with proper date formatting
function formatUserData(user) {
  return {
    ...user,
    createdAt: formatDateTime(user.createdAt),
    lastSeen: user.lastSeen ? formatDateTime(user.lastSeen) : null,
    lastLogin: user.lastLogin ? formatDateTime(user.lastLogin) : null,
    signatureUpdatedAt: user.signatureUpdatedAt ? formatDateTime(user.signatureUpdatedAt) : null
  };
}

// Format project data with proper date formatting
function formatProjectData(project) {
  return {
    ...project,
    projectStartDate: formatDate(project.projectStartDate),
    projectEndDate: project.projectEndDate ? formatDate(project.projectEndDate) : null,
    createdAt: formatDateTime(project.createdAt),
    updatedAt: formatDateTime(project.updatedAt)
  };
}

// Format company data with proper date formatting
function formatCompanyData(company) {
  return {
    ...company,
    createdAt: formatDateTime(company.createdAt),
    updatedAt: formatDateTime(company.updatedAt)
  };
}

// Format route data with proper date formatting
function formatRouteData(route) {
  return {
    ...route,
    createdAt: formatDateTime(route.createdAt),
    updatedAt: formatDateTime(route.updatedAt)
  };
}

function formatTemplateData(template) {
  return {
    ...template,
    uploadedAt: formatDateTime(template.uploadedAt),
    lastModifiedAt: template.lastModifiedAt ? formatDateTime(template.lastModifiedAt) : null
  };
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

// Function to add a new activity to the log
const logActivity = async (userId, activityType, details = {}) => {
  try {
    // Get the user info if available
    let userInfo = { userId };
    
    if (userId) {
      // Get the user from DynamoDB to access their details
      const userParams = new GetCommand({
        TableName: "Users",
        Key: { userId }
      });
      
      const userResult = await dynamoDB.send(userParams);
      
      if (userResult.Item) {
        userInfo = {
          userId,
          email: userResult.Item.email,
          username: userResult.Item.username || userResult.Item.email.split('@')[0]
        };
      }
    }
    
    // Create activity entry
    const activity = {
      timestamp: new Date().toISOString(),
      userInfo,
      type: activityType,
      details
    };
    
    // Add to the front of the array (newest first)
    activityLog.unshift(activity);
    
    // Trim the array if it's too long
    if (activityLog.length > MAX_ACTIVITIES) {
      activityLog.length = MAX_ACTIVITIES;
    }
    
    console.log(`Activity logged: ${activityType} by ${userInfo.email || userId}`);
  } catch (err) {
    console.error("Error logging activity:", err);
  }
};

function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now - new Date(date);
  
  // Less than a minute
  if (diffMs < 60000) {
    return "just now";
  }
  
  // Less than an hour
  if (diffMs < 3600000) {
    const minutes = Math.floor(diffMs / 60000);
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  }
  
  // Less than a day
  if (diffMs < 86400000) {
    const hours = Math.floor(diffMs / 3600000);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  
  // More than a day
  const days = Math.floor(diffMs / 86400000);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
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

  else if (req.method === "GET" && req.url === "/activity") {
    // Check if token is valid
    if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Unauthorized" }));
    }
    
    // Format activity log entries into human-readable strings
    const formattedActivities = activityLog.map(activity => {
      const timeAgo = formatTimeAgo(activity.timestamp);
      const username = activity.userInfo.username || activity.userInfo.email || 'Unknown user';
      
      let message = '';
      switch (activity.type) {
        case 'user_created':
          message = `${username} created a new user: ${activity.details.email || 'New user'}`;
          break;
        case 'user_deleted':
          message = `${username} deleted user: ${activity.details.email || 'Unknown user'}`;
          break;
        case 'project_created':
          message = `${username} created a new project: ${activity.details.projectName || 'New project'}`;
          break;
        case 'project_deleted':
          message = `${username} deleted project: ${activity.details.projectName || 'Unknown project'}`;
          break;
        case 'company_created':
          message = `${username} created a new company: ${activity.details.companyName || 'New company'}`;
          break;
        case 'company_deleted':
          message = `${username} deleted company: ${activity.details.companyName || 'Unknown company'}`;
          break;
        case 'template_uploaded':
          message = `${username} uploaded a new Excel template: ${activity.details.name || 'New template'}`;
          break;
        case 'template_deleted':
          message = `${username} deleted Excel template: ${activity.details.name || 'Unknown template'}`;
          break;
        case 'project_assigned':
          message = `${username} assigned ${activity.details.projectName || 'a project'} to ${activity.details.username || 'a user'}`;
          break;
        case 'project_unassigned':
          message = `${username} removed ${activity.details.projectName || 'a project'} assignment from ${activity.details.username || 'a user'}`;
          break;
        case 'route_created':
          message = `${username} created a new route from ${activity.details.startLocation} to ${activity.details.destination}`;
          break;
        case 'route_deleted':
          message = `${username} deleted route from ${activity.details.startLocation} to ${activity.details.destination}`;
          break;
        default:
          message = `${username} performed an action`;
      }
      
      return `${message} (${timeAgo})`;
    });
    
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(formattedActivities));
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
          
          // Update the user's lastLogin field before setting them as online
          // Read current lastSeen (if any) before updating it
          const previousLogin = user.lastSeen;
          
          // Update user record in DynamoDB to include lastLogin timestamp
          const updateUserParams = new PutCommand({
            TableName: "Users",
            Item: {
              ...user,
              lastLogin: previousLogin || null, // Use previous lastSeen as lastLogin
              lastSeen: new Date().toISOString() // Update lastSeen to current time
            }
          });
          
          await dynamoDB.send(updateUserParams);
          
          // Mark user as online
          updateOnlineStatus(user.userId, true);
          
          // Format the user data for response
          const formattedUser = formatUserData({
            ...user,
            lastLogin: previousLogin || null,
            lastSeen: new Date().toISOString()
          });
          
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ 
            authenticated: true,
            token,
            user: {
              userId: formattedUser.userId,
              email: formattedUser.email,
              username: formattedUser.username,
              createdAt: formattedUser.createdAt,
              lastLogin: formattedUser.lastLogin,
              role: formattedUser.role || "user",
              mustChangePassword: formattedUser.mustChangePassword || false
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
        const user = {
          userId,
          email: userData.email,
          passwordHash,
          salt,
          createdAt: userData.createdAt,
          username: userData.username || userData.email.split('@')[0],
          role: userData.role || "user", // Default role for new users
          mustChangePassword: userData.mustChangePassword !== undefined ? userData.mustChangePassword : true, // Default to true if not specified
          isOnline: false, // Explicitly set new users to offline
          lastSeen: new Date().toISOString(), // Set last seen to creation time
          lastLogin: null // Initialize lastLogin as null for new users
        };
        
        const params = new PutCommand({
          TableName: "Users",
          Item: user
        });
  
        await dynamoDB.send(params);

        if (token && tokenStore.has(token)) {
          const adminUserId = tokenStore.get(token).userId;
          
          // Log user creation activity
          await logActivity(adminUserId, 'user_created', { 
            email: userData.email,
            username: userData.username || userData.email.split('@')[0]
          });
        }

        // Format the user data for response
        const formattedUser = formatUserData(user);
  
        // Return success without creating a token and marking online
        // The user will need to log in separately
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ 
          message: "User created successfully",
          user: { 
            userId: formattedUser.userId,
            email: formattedUser.email,
            username: formattedUser.username,
            createdAt: formattedUser.createdAt,
            role: formattedUser.role,
            mustChangePassword: formattedUser.mustChangePassword,
            isOnline: false,
            lastLogin: null
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
        // Remove sensitive fields from response and format dates
        const safeUsers = (data.Items || []).map(user => {
          const { passwordHash, salt, ...safeUser } = user;
          
          // Add online status to each user
          const onlineStatus = onlineUsers.get(user.userId);
          const userWithStatus = {
            ...safeUser,
            isOnline: onlineStatus ? onlineStatus.isOnline : false,
            lastSeen: onlineStatus ? onlineStatus.lastUpdated : null,
            lastLogin: safeUser.lastLogin || null
          };
          
          // Apply date formatting
          return formatUserData(userWithStatus);
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
          lastSeen: onlineStatus ? onlineStatus.lastUpdated : null,
          lastLogin: safeUser.lastLogin || null
        };
        
        // Apply date formatting
        const formattedUser = formatUserData(userWithStatus);
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(formattedUser));
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
            : existingUser.mustChangePassword,
          // Preserve the lastLogin field
          lastLogin: existingUser.lastLogin || null
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
        
        // Remove sensitive fields from response and format dates
        const { passwordHash, salt, ...safeUser } = updatedUser;
        const formattedUser = formatUserData(safeUser);
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ...formattedUser,
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
          mustChangePassword: isSelfChange ? false : true, // Only set to false if user is changing their own password
          // Preserve the lastLogin field
          lastLogin: user.lastLogin || null
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
        // Get user details before deletion for activity log
        const getUserParams = new GetCommand({
          TableName: "Users",
          Key: { userId: userId }
        });
        
        const userResult = await dynamoDB.send(getUserParams);
        let userDetails = null;
        
        if (userResult.Item) {
          userDetails = {
            email: userResult.Item.email,
            username: userResult.Item.username || userResult.Item.email.split('@')[0]
          };
        }
        
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
        
        // Log the deletion activity
        if (userDetails) {
          await logActivity(currentUserId, 'user_deleted', userDetails);
        }
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "User deleted successfully" }));
      } catch (err) {
        console.error("Error deleting user:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    })();
  }

  // Add these endpoints to your server.js file after your existing user management endpoints

// Get all projects
else if (req.method === "GET" && req.url === "/projects") {
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }

  const params = new ScanCommand({ TableName: "Projects" });

  dynamoDB.send(params)
    .then((data) => {
      // Format dates for all projects
      const formattedProjects = (data.Items || []).map(project => formatProjectData(project));
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(formattedProjects));
    })
    .catch((err) => {
      console.error("Error fetching projects:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    });
}

// Get a single project by ID
else if (req.method === "GET" && req.url.match(/^\/projects\/[^\/]+$/)) {
  // Extract projectId from URL
  const projectId = req.url.split("/")[2];
  
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  // Get project by primary key (projectId)
  const params = new GetCommand({
    TableName: "Projects",
    Key: {
      projectId: projectId
    }
  });
  
  dynamoDB.send(params)
    .then((data) => {
      if (!data.Item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Project not found" }));
      }
      
      // Format dates for the project
      const formattedProject = formatProjectData(data.Item);
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(formattedProject));
    })
    .catch((err) => {
      console.error("Error fetching project:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    });
}

// Create a new project
else if (req.method === "POST" && req.url === "/projects") {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", async () => {
    try {
      const projectData = JSON.parse(body);
      
      // Validate project input
      if (!projectData.projectName || !projectData.projectStartDate) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Project name and start date are required" }));
      }
      
      // Validate company field length
      if (projectData.company && projectData.company.length > 50) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Company name must be 50 characters or less" }));
      }
      
      // Validate description field length
      if (projectData.description && projectData.description.length > 500) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Description must be 500 characters or less" }));
      }
      
      // Check if token is valid
      if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Unauthorized" }));
      }
      
      // Generate unique project ID
      const projectId = "proj-" + uuidv4().substring(0, 8);
      
      // Get the userId of the creator from the token
      const userId = tokenStore.get(token).userId;
      
      // Parse date format (DD/MM/YYYY to ISO format)
      let startDate, endDate;

      try {
        startDate = parseDate(projectData.projectStartDate);
        if (!startDate) {
          throw new Error("Invalid start date format");
        }
        
        if (projectData.projectEndDate) {
          endDate = parseDate(projectData.projectEndDate);
          if (!endDate) {
            throw new Error("Invalid end date format");
          }
        } else {
          endDate = null;
        }
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Invalid date format. Please use DD/MM/YYYY." }));
      }

      // Create the project object with new fields
      const project = {
        projectId,
        projectName: projectData.projectName,
        projectStartDate: startDate,
        projectEndDate: endDate,
        company: projectData.company || "",
        description: projectData.description || "",
        createdBy: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      const params = new PutCommand({
        TableName: "Projects",
        Item: project
      });

      await dynamoDB.send(params);

      // Log project creation (one of the required activities to log)
      await logActivity(userId, 'project_created', {
        projectName: projectData.projectName,
        projectId: projectId
      });

      // Format dates for response
      const responseProject = formatProjectData(project);

      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ 
        message: "Project created successfully",
        project: responseProject
      }));
    } catch (err) {
      console.error("Error creating project:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

// Update a project
else if (req.method === "PUT" && req.url.match(/^\/projects\/[^\/]+$/)) {
  // Extract projectId from URL
  const projectId = req.url.split("/")[2];
  
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", async () => {
    try {
      const projectData = JSON.parse(body);
      
      // Validate company field length
      if (projectData.company && projectData.company.length > 50) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Company name must be 50 characters or less" }));
      }
      
      // Validate description field length
      if (projectData.description && projectData.description.length > 500) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Description must be 500 characters or less" }));
      }
      
      // First, get the existing project
      const getParams = new GetCommand({
        TableName: "Projects",
        Key: {
          projectId: projectId
        }
      });
      
      const existingProjectResult = await dynamoDB.send(getParams);
      
      if (!existingProjectResult.Item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Project not found" }));
      }
      
      const existingProject = existingProjectResult.Item;
      
      // Parse dates if needed
      let startDate = existingProject.projectStartDate;
      let endDate = existingProject.projectEndDate;

      try {
        if (projectData.projectStartDate) {
          startDate = parseDate(projectData.projectStartDate);
          if (!startDate) {
            throw new Error("Invalid start date format");
          }
        }
        
        if (projectData.projectEndDate !== undefined) {
          if (projectData.projectEndDate) {
            endDate = parseDate(projectData.projectEndDate);
            if (!endDate) {
              throw new Error("Invalid end date format");
            }
          } else {
            endDate = null;
          }
        }
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Invalid date format. Please use DD/MM/YYYY." }));
      }

      // Update the project object
      const updatedProject = {
        ...existingProject,
        projectName: projectData.projectName || existingProject.projectName,
        projectStartDate: startDate,
        projectEndDate: endDate,
        company: projectData.company !== undefined ? projectData.company : (existingProject.company || ""),
        description: projectData.description !== undefined ? projectData.description : (existingProject.description || ""),
        updatedAt: new Date().toISOString()
      };
      
      const updateParams = new PutCommand({
        TableName: "Projects",
        Item: updatedProject
      });
      
      await dynamoDB.send(updateParams);
      
      // Format dates for response
      const responseProject = formatProjectData(updatedProject);
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(responseProject));
    } catch (err) {
      console.error("Error updating project:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

// Delete a project
else if (req.method === "DELETE" && req.url.match(/^\/projects\/[^\/]+$/)) {
  // Extract projectId from URL
  const projectId = req.url.split("/")[2];
  
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }

  // Get the userId of the deleter from the token
  const userId = tokenStore.get(token).userId;
  
  // Get project details before deletion
  (async () => {
    try {
      // Fetch project details first for the activity log
      const getProjectParams = new GetCommand({
        TableName: "Projects",
        Key: { projectId: projectId }
      });
      
      const projectResult = await dynamoDB.send(getProjectParams);
      let projectDetails = null;
      
      if (projectResult.Item) {
        projectDetails = {
          projectName: projectResult.Item.projectName,
          projectId: projectId
        };
      }
      
      // Delete the project
      const deleteParams = new DeleteCommand({
        TableName: "Projects",
        Key: {
          projectId: projectId
        }
      });
      
      await dynamoDB.send(deleteParams);
      
      // Log the deletion activity
      if (projectDetails) {
        await logActivity(userId, 'project_deleted', projectDetails);
      }
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Project deleted successfully" }));
    } catch (err) {
      console.error("Error deleting project:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  })();
}
  
// Get projects assigned to a user
else if (req.method === "GET" && req.url.match(/^\/users\/[^\/]+\/projects$/)) {
  // Extract userId from URL
  const userId = req.url.split("/")[2];
  
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  // Handle async operation
  (async () => {
    try {
      // Fetch UserProjects records for this user
      const params = new ScanCommand({
        TableName: "UserProjects",
        FilterExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":userId": userId
        }
      });
      
      const result = await dynamoDB.send(params);
      
      if (!result.Items || result.Items.length === 0) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify([]));
      }
      
      // Extract project IDs from assignments
      const projectIds = result.Items.map(item => item.projectId);
      
      // For each project ID, fetch the project details
      const projectPromises = projectIds.map(projectId => {
        const projectParams = new GetCommand({
          TableName: "Projects",
          Key: {
            projectId: projectId
          }
        });
        return dynamoDB.send(projectParams);
      });
      
      const projectResults = await Promise.all(projectPromises);
      const projects = projectResults
        .filter(result => result.Item) // Filter out any not found
        .map(result => result.Item);
      
      // Format dates for all projects
      const formattedProjects = projects.map(project => formatProjectData(project));
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(formattedProjects));
    } catch (err) {
      console.error("Error fetching user projects:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  })();
}

// Assign a project to a user
else if (req.method === "POST" && req.url.match(/^\/users\/[^\/]+\/projects\/[^\/]+$/)) {
  // Extract userId and projectId from URL
  const urlParts = req.url.split("/");
  const userId = urlParts[2];
  const projectId = urlParts[4];
  
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  // Handle async operation
  (async () => {
    try {
      // Check if the user exists
      const userParams = new GetCommand({
        TableName: "Users",
        Key: {
          userId: userId
        }
      });
      
      const userResult = await dynamoDB.send(userParams);
      
      if (!userResult.Item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "User not found" }));
      }
      
      // Check if the project exists
      const projectParams = new GetCommand({
        TableName: "Projects",
        Key: {
          projectId: projectId
        }
      });
      
      const projectResult = await dynamoDB.send(projectParams);
      
      if (!projectResult.Item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Project not found" }));
      }
      
      // Check if assignment already exists
      const checkParams = new ScanCommand({
        TableName: "UserProjects",
        FilterExpression: "userId = :userId AND projectId = :projectId",
        ExpressionAttributeValues: {
          ":userId": userId,
          ":projectId": projectId
        }
      });
      
      const existingAssignment = await dynamoDB.send(checkParams);
      
      if (existingAssignment.Items && existingAssignment.Items.length > 0) {
        res.writeHead(409, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Project already assigned to user" }));
      }
      
      // Create a new assignment
      const assignmentId = "assignment-" + uuidv4().substring(0, 8);
      
      const assignParams = new PutCommand({
        TableName: "UserProjects",
        Item: {
          assignmentId,
          userId,
          projectId,
          assignedAt: new Date().toISOString(),
          assignedBy: tokenStore.get(token).userId // Track who made the assignment
        }
      });
      
      await dynamoDB.send(assignParams);
      
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ 
        message: "Project assigned to user successfully",
        assignmentId
      }));
    } catch (err) {
      console.error("Error assigning project to user:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  })();
}

// Remove a project assignment from a user
else if (req.method === "DELETE" && req.url.match(/^\/users\/[^\/]+\/projects\/[^\/]+$/)) {
  // Extract userId and projectId from URL
  const urlParts = req.url.split("/");
  const userId = urlParts[2];
  const projectId = urlParts[4];
  
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  // Get the ID of the user performing the action
  const currentUserId = tokenStore.get(token).userId;
  
  // Handle async operation
  (async () => {
    try {
      // Find the assignment
      const findParams = new ScanCommand({
        TableName: "UserProjects",
        FilterExpression: "userId = :userId AND projectId = :projectId",
        ExpressionAttributeValues: {
          ":userId": userId,
          ":projectId": projectId
        }
      });
      
      const result = await dynamoDB.send(findParams);
      
      if (!result.Items || result.Items.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Assignment not found" }));
      }
      
      // Get user and project details for the activity log
      const [userResult, projectResult] = await Promise.all([
        dynamoDB.send(new GetCommand({
          TableName: "Users",
          Key: { userId }
        })),
        dynamoDB.send(new GetCommand({
          TableName: "Projects",
          Key: { projectId }
        }))
      ]);
      
      let assignmentDetails = {
        userId,
        projectId
      };
      
      if (userResult.Item) {
        assignmentDetails.username = userResult.Item.username || userResult.Item.email.split('@')[0];
      }
      
      if (projectResult.Item) {
        assignmentDetails.projectName = projectResult.Item.projectName;
      }
      
      // Delete the assignment
      const assignment = result.Items[0];
      
      const deleteParams = new DeleteCommand({
        TableName: "UserProjects",
        Key: {
          assignmentId: assignment.assignmentId
        }
      });
      
      await dynamoDB.send(deleteParams);
      
      // Log the unassignment activity
      await logActivity(currentUserId, 'project_unassigned', assignmentDetails);
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ 
        message: "Project unassigned from user successfully" 
      }));
    } catch (err) {
      console.error("Error removing project from user:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  })();
} 

  // Excel Templates endpoints
// Get all Excel templates
else if (req.method === "GET" && req.url === "/excel-templates") {
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }

  const params = new ScanCommand({ TableName: "ExcelTemplates" });

  dynamoDB.send(params)
    .then((data) => {
      // Format dates for all templates
      const formattedTemplates = (data.Items || []).map(template => formatTemplateData(template));
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(formattedTemplates));
    })
    .catch((err) => {
      console.error("Error fetching Excel templates:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    });
}

// Upload a new Excel template
else if (req.method === "POST" && req.url === "/excel-templates") {
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }

  const userId = tokenStore.get(token).userId;
  
  // Create a temporary file path
  const tempDir = path.join(__dirname, "temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  // Multipart form data handling
  const busboy = require('busboy');
  const busboyInstance = busboy({ headers: req.headers });
  
  let templateData = {
    templateId: "template-" + uuidv4().substring(0, 8),
    uploadedAt: new Date().toISOString(),
    uploadedBy: userId,
    isActive: true,
    fileSize: 0
  };
  
  let filePath;
  let fileBuffer;
  
  busboyInstance.on('field', (name, val) => {
    if (name === 'name') templateData.name = val;
    if (name === 'description') templateData.description = val;
    if (name === 'isActive') templateData.isActive = val === 'true';
  });
  
  busboyInstance.on('file', (name, file, info) => {
    const { filename, mimeType } = info;
    
    // Validate file type
    if (!filename.endsWith('.xlsx') && !filename.endsWith('.xls')) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Only Excel files (.xlsx, .xls) are allowed" }));
      return;
    }
    
    templateData.originalFilename = filename;
    templateData.mimeType = mimeType;
    
    filePath = path.join(tempDir, templateData.templateId + path.extname(filename));
    
    const chunks = [];
    let fileSize = 0;
    
    file.on('data', (data) => {
      chunks.push(data);
      fileSize += data.length;
      
      // Check file size limit (10MB)
      if (fileSize > 10 * 1024 * 1024) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "File size exceeds 10MB limit" }));
        file.resume(); // Skip the rest of the file
      }
    });
    
    file.on('end', () => {
      if (fileSize <= 10 * 1024 * 1024) {
        fileBuffer = Buffer.concat(chunks);
        templateData.fileSize = fileSize;
        
        // Write file to disk temporarily
        fs.writeFileSync(filePath, fileBuffer);
      }
    });
  });
  
  busboyInstance.on('finish', async () => {
    try {
      if (!templateData.name) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Template name is required" }));
      }
      
      if (!filePath || !fs.existsSync(filePath)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "No file uploaded or file processing failed" }));
      }
      
      // Read the file into an S3-compatible storage (or your preferred storage)
      // For this implementation, we'll store the file content in DynamoDB directly
      // Note: In a production environment, you'd typically use S3 or similar for file storage
      
      // Convert file to base64 for storage
      const fileContent = fs.readFileSync(filePath);
      const fileBase64 = fileContent.toString('base64');
      
      // Store template metadata and file content in DynamoDB
      const params = new PutCommand({
        TableName: "ExcelTemplates",
        Item: {
          ...templateData,
          fileContent: fileBase64
        }
      });
      
      await dynamoDB.send(params);

      await logActivity(userId, 'template_uploaded', {
        name: templateData.name,
        templateId: templateData.templateId
      });
      
      // Remove temporary file
      fs.unlinkSync(filePath);
      
      // Format the response data
      const formattedTemplate = formatTemplateData(templateData);
      
      // Return success response with formatted dates
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        message: "Template uploaded successfully",
        template: formattedTemplate
      }));
    } catch (err) {
      console.error("Error uploading template:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
      
      // Clean up temporary file if it exists
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });
  
  req.pipe(busboyInstance);
}

// Download a template
else if (req.method === "GET" && req.url.match(/^\/excel-templates\/[^\/]+\/download$/)) {
  // Extract templateId from URL
  const templateId = req.url.split("/")[2];
  
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  // Get template from DynamoDB
  const params = new GetCommand({
    TableName: "ExcelTemplates",
    Key: {
      templateId: templateId
    }
  });
  
  dynamoDB.send(params)
    .then((data) => {
      if (!data.Item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Template not found" }));
      }
      
      const template = data.Item;
      
      // Decode file content from base64
      const fileBuffer = Buffer.from(template.fileContent, 'base64');
      
      // Set appropriate headers for file download
      const extension = template.originalFilename ? 
        path.extname(template.originalFilename) : 
        (template.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ? '.xlsx' : '.xls');
      
      const filename = template.name + extension;
      
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', template.mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', fileBuffer.length);
      
      res.writeHead(200);
      res.end(fileBuffer);
    })
    .catch((err) => {
      console.error("Error downloading template:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    });
}

// Toggle template status (activate/deactivate)
else if (req.method === "PUT" && req.url.match(/^\/excel-templates\/[^\/]+\/toggle-status$/)) {
  // Extract templateId from URL
  const templateId = req.url.split("/")[2];
  
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", async () => {
    try {
      const statusData = JSON.parse(body);
      
      // Get the current template
      const getParams = new GetCommand({
        TableName: "ExcelTemplates",
        Key: {
          templateId: templateId
        }
      });
      
      const result = await dynamoDB.send(getParams);
      
      if (!result.Item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Template not found" }));
      }
      
      const template = result.Item;
      
      // Update template status
      const updatedTemplate = {
        ...template,
        isActive: statusData.isActive,
        lastModifiedAt: new Date().toISOString()
      };
      
      const updateParams = new PutCommand({
        TableName: "ExcelTemplates",
        Item: updatedTemplate
      });
      
      await dynamoDB.send(updateParams);
      
      // Format the response data
      const formattedTemplate = formatTemplateData(updatedTemplate);
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ 
        message: `Template ${statusData.isActive ? 'activated' : 'deactivated'} successfully`,
        isActive: statusData.isActive,
        template: formattedTemplate
      }));
    } catch (err) {
      console.error("Error toggling template status:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

// Delete a template
else if (req.method === "DELETE" && req.url.match(/^\/excel-templates\/[^\/]+$/)) {
  // Extract templateId from URL
  const templateId = req.url.split("/")[2];
  
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  // Get the userId of the deleter from the token
  const userId = tokenStore.get(token).userId;
  
  // Get template details before deletion
  (async () => {
    try {
      // Fetch template details for the activity log
      const getTemplateParams = new GetCommand({
        TableName: "ExcelTemplates",
        Key: { templateId: templateId }
      });
      
      const templateResult = await dynamoDB.send(getTemplateParams);
      let templateDetails = null;
      
      if (templateResult.Item) {
        templateDetails = {
          name: templateResult.Item.name,
          templateId: templateId
        };
      }
      
      // Delete template from DynamoDB
      const deleteParams = new DeleteCommand({
        TableName: "ExcelTemplates",
        Key: {
          templateId: templateId
        }
      });
      
      await dynamoDB.send(deleteParams);
      
      // Log the deletion activity
      if (templateDetails) {
        await logActivity(userId, 'template_deleted', templateDetails);
      }
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Template deleted successfully" }));
    } catch (err) {
      console.error("Error deleting template:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  })();
}


else if (req.method === "GET" && req.url === "/companies") {
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }

  const params = new ScanCommand({ TableName: "Companies" });

  dynamoDB.send(params)
    .then((data) => {
      // Format dates for all companies
      const formattedCompanies = (data.Items || []).map(company => formatCompanyData(company));
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(formattedCompanies));
    })
    .catch((err) => {
      console.error("Error fetching companies:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    });
}

// Get a single company by ID
else if (req.method === "GET" && req.url.match(/^\/companies\/[^\/]+$/)) {
  // Extract companyId from URL
  const companyId = req.url.split("/")[2];
  
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  // Get company by primary key (companyId)
  const params = new GetCommand({
    TableName: "Companies",
    Key: {
      companyId: companyId
    }
  });
  
  dynamoDB.send(params)
    .then((data) => {
      if (!data.Item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Company not found" }));
      }
      
      // Format dates for the company
      const formattedCompany = formatCompanyData(data.Item);
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(formattedCompany));
    })
    .catch((err) => {
      console.error("Error fetching company:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    });
}

// Create a new company
else if (req.method === "POST" && req.url === "/companies") {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", async () => {
    try {
      const companyData = JSON.parse(body);
      
      // Validate company input
      if (!companyData.companyName || !companyData.nif) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Company name and NIF are required" }));
      }
      
      // Check if token is valid
      if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Unauthorized" }));
      }
      
      // Get the userId of the creator from the token
      const userId = tokenStore.get(token).userId;
      
      // Generate unique company ID
      const companyId = "comp-" + uuidv4().substring(0, 8);
      
      // Create the company object
      const company = {
        companyId,
        companyName: companyData.companyName,
        nif: companyData.nif,
        address: companyData.address || "",
        description: companyData.description || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      const params = new PutCommand({
        TableName: "Companies",
        Item: company
      });

      await dynamoDB.send(params);

      // Make sure userId is defined before calling logActivity
      await logActivity(userId, 'company_created', {
        companyName: companyData.companyName,
        companyId: companyId
      });

      // Format dates for response
      const formattedCompany = formatCompanyData(company);

      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ 
        message: "Company created successfully",
        company: formattedCompany
      }));
    } catch (err) {
      console.error("Error creating company:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

// Update a company
else if (req.method === "PUT" && req.url.match(/^\/companies\/[^\/]+$/)) {
  // Extract companyId from URL
  const companyId = req.url.split("/")[2];
  
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", async () => {
    try {
      const companyData = JSON.parse(body);
      
      // First, get the existing company
      const getParams = new GetCommand({
        TableName: "Companies",
        Key: {
          companyId: companyId
        }
      });
      
      const existingCompanyResult = await dynamoDB.send(getParams);
      
      if (!existingCompanyResult.Item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Company not found" }));
      }
      
      const existingCompany = existingCompanyResult.Item;
      
      // Update the company object
      const updatedCompany = {
        ...existingCompany,
        companyName: companyData.companyName || existingCompany.companyName,
        nif: companyData.nif || existingCompany.nif,
        address: companyData.address !== undefined ? companyData.address : (existingCompany.address || ""),
        description: companyData.description !== undefined ? companyData.description : (existingCompany.description || ""),
        updatedAt: new Date().toISOString()
      };
      
      const updateParams = new PutCommand({
        TableName: "Companies",
        Item: updatedCompany
      });
      
      await dynamoDB.send(updateParams);
      
      // Format dates for response
      const formattedCompany = formatCompanyData(updatedCompany);
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(formattedCompany));
    } catch (err) {
      console.error("Error updating company:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

// Delete a company
else if (req.method === "DELETE" && req.url.match(/^\/companies\/[^\/]+$/)) {
  // Extract companyId from URL
  const companyId = req.url.split("/")[2];
  
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }

  // Get the userId of the deleter from the token
  const userId = tokenStore.get(token).userId;
  
  // Get company details before deletion
  (async () => {
    try {
      // Fetch company details for the activity log
      const getCompanyParams = new GetCommand({
        TableName: "Companies",
        Key: { companyId: companyId }
      });
      
      const companyResult = await dynamoDB.send(getCompanyParams);
      let companyDetails = null;
      
      if (companyResult.Item) {
        companyDetails = {
          companyName: companyResult.Item.companyName,
          companyId: companyId
        };
      }
      
      // Delete the company
      const deleteParams = new DeleteCommand({
        TableName: "Companies",
        Key: {
          companyId: companyId
        }
      });
      
      await dynamoDB.send(deleteParams);
      
      // Log the deletion activity
      if (companyDetails) {
        await logActivity(userId, 'company_deleted', companyDetails);
      }
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Company deleted successfully" }));
    } catch (err) {
      console.error("Error deleting company:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  })();
}
// Get all routes
else if (req.method === "GET" && req.url === "/routes") {
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }

  const params = new ScanCommand({ TableName: "Routes" });

  dynamoDB.send(params)
    .then((data) => {
      // Format dates for all routes
      const formattedRoutes = (data.Items || []).map(route => formatRouteData(route));
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(formattedRoutes));
    })
    .catch((err) => {
      console.error("Error fetching routes:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    });
}

// Get a single route by ID
else if (req.method === "GET" && req.url.match(/^\/routes\/[^\/]+$/)) {
  // Extract routeId from URL
  const routeId = req.url.split("/")[2];
  
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  // Get route by primary key (routeId)
  const params = new GetCommand({
    TableName: "Routes",
    Key: {
      routeId: routeId
    }
  });
  
  dynamoDB.send(params)
    .then((data) => {
      if (!data.Item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Route not found" }));
      }
      
      // Format dates for the route
      const formattedRoute = formatRouteData(data.Item);
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(formattedRoute));
    })
    .catch((err) => {
      console.error("Error fetching route:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    });
}

// Create a new route
else if (req.method === "POST" && req.url === "/routes") {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", async () => {
    try {
      const routeData = JSON.parse(body);
      
      // Validate route input
      if (!routeData.startLocation || !routeData.destination || routeData.routeLength === undefined) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Start location, destination, and route length are required" }));
      }
      
      // Check if token is valid
      if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Unauthorized" }));
      }
      
      // Generate unique route ID
      const routeId = "route-" + uuidv4().substring(0, 8);
      
      // Get the userId of the creator from the token
      const userId = tokenStore.get(token).userId;
      
      // Create the route object
      const route = {
        routeId,
        startLocation: routeData.startLocation,
        destination: routeData.destination,
        routeLength: routeData.routeLength,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      const params = new PutCommand({
        TableName: "Routes",
        Item: route
      });

      await dynamoDB.send(params);

      // Log route creation activity
      await logActivity(userId, 'route_created', {
        startLocation: routeData.startLocation,
        destination: routeData.destination,
        routeId: routeId
      });

      // Format dates for response
      const formattedRoute = formatRouteData(route);

      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ 
        message: "Route created successfully",
        route: formattedRoute
      }));
    } catch (err) {
      console.error("Error creating route:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

// Update a route
else if (req.method === "PUT" && req.url.match(/^\/routes\/[^\/]+$/)) {
  // Extract routeId from URL
  const routeId = req.url.split("/")[2];
  
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", async () => {
    try {
      const routeData = JSON.parse(body);
      
      // First, get the existing route
      const getParams = new GetCommand({
        TableName: "Routes",
        Key: {
          routeId: routeId
        }
      });
      
      const existingRouteResult = await dynamoDB.send(getParams);
      
      if (!existingRouteResult.Item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Route not found" }));
      }
      
      const existingRoute = existingRouteResult.Item;
      
      // Update the route object
      const updatedRoute = {
        ...existingRoute,
        startLocation: routeData.startLocation || existingRoute.startLocation,
        destination: routeData.destination || existingRoute.destination,
        routeLength: routeData.routeLength !== undefined ? routeData.routeLength : existingRoute.routeLength,
        updatedAt: new Date().toISOString()
      };
      
      const updateParams = new PutCommand({
        TableName: "Routes",
        Item: updatedRoute
      });
      
      await dynamoDB.send(updateParams);
      
      // Log route update activity
      await logActivity(tokenStore.get(token).userId, 'route_updated', {
        routeId: routeId,
        startLocation: updatedRoute.startLocation,
        destination: updatedRoute.destination
      });
      
      // Format dates for response
      const formattedRoute = formatRouteData(updatedRoute);
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(formattedRoute));
    } catch (err) {
      console.error("Error updating route:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

// Delete a route
else if (req.method === "DELETE" && req.url.match(/^\/routes\/[^\/]+$/)) {
  // Extract routeId from URL
  const routeId = req.url.split("/")[2];
  
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }

  // Get the userId of the deleter from the token
  const userId = tokenStore.get(token).userId;
  
  // Get route details before deletion
  (async () => {
    try {
      // Fetch route details for the activity log
      const getRouteParams = new GetCommand({
        TableName: "Routes",
        Key: { routeId: routeId }
      });
      
      const routeResult = await dynamoDB.send(getRouteParams);
      let routeDetails = null;
      
      if (routeResult.Item) {
        routeDetails = {
          startLocation: routeResult.Item.startLocation,
          destination: routeResult.Item.destination,
          routeId: routeId
        };
      }
      
      // Delete the route
      const deleteParams = new DeleteCommand({
        TableName: "Routes",
        Key: {
          routeId: routeId
        }
      });
      
      await dynamoDB.send(deleteParams);
      
      // Log the deletion activity
      if (routeDetails) {
        await logActivity(userId, 'route_deleted', routeDetails);
      }
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Route deleted successfully" }));
    } catch (err) {
      console.error("Error deleting route:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  })();
}

// Get user signature
else if (req.method === "GET" && req.url.match(/^\/users\/[^\/]+\/signature$/)) {
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
      
      // Check if the user has a signature
      const signatureUrl = data.Item.signatureUrl || null;
      const signatureUpdatedAt = data.Item.signatureUpdatedAt ? formatDateTime(data.Item.signatureUpdatedAt) : null;
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ 
        signatureUrl,
        signatureUpdatedAt 
      }));
    })
    .catch((err) => {
      console.error("Error fetching user signature:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    });
}

// Upload user signature
else if (req.method === "POST" && req.url.match(/^\/users\/[^\/]+\/signature$/)) {
  // Extract userId from URL
  const userId = req.url.split("/")[2];
  
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  // First, check if the user exists and get their data
  const getUserParams = new GetCommand({
    TableName: "Users",
    Key: {
      userId: userId
    }
  });
  
  // Verify that the token user is authorized to update this user's signature
  // Users can only update their own signature
  const tokenUserId = tokenStore.get(token).userId;
  if (tokenUserId !== userId) {
    res.writeHead(403, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "You can only update your own signature" }));
  }

  // Create a temporary file path
  const tempDir = path.join(__dirname, "temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  // Handle multipart form data for file upload
  const busboyInstance = busboy({ headers: req.headers });
  
  let filePath;
  let fileBuffer;
  let mimeType;
  let originalFilename;
  
  busboyInstance.on('file', (name, file, info) => {
    if (name !== 'signature') {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Invalid form field name. Expected 'signature'" }));
    }
    
    const { filename, mimeType: fileMimeType } = info;
    
    // Validate file type is an image
    if (!fileMimeType.startsWith('image/')) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Only image files are allowed" }));
    }
    
    originalFilename = filename;
    mimeType = fileMimeType;
    
    // Create a unique filename
    const signatureId = uuidv4();
    filePath = path.join(tempDir, `${signatureId}${path.extname(filename)}`);
    
    const chunks = [];
    let fileSize = 0;
    
    file.on('data', (data) => {
      chunks.push(data);
      fileSize += data.length;
      
      // Check file size limit (2MB)
      if (fileSize > 2 * 1024 * 1024) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "File size exceeds 2MB limit" }));
        file.resume(); // Skip the rest of the file
      }
    });
    
    file.on('end', () => {
      if (fileSize <= 2 * 1024 * 1024) {
        fileBuffer = Buffer.concat(chunks);
        
        // Write file to disk temporarily
        fs.writeFileSync(filePath, fileBuffer);
      }
    });
  });
  
  busboyInstance.on('finish', async () => {
    try {
      if (!filePath || !fs.existsSync(filePath)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "No file uploaded or file processing failed" }));
      }
      
      // Get the user data first
      const userResult = await dynamoDB.send(getUserParams);
      
      if (!userResult.Item) {
        // Clean up temporary file
        fs.unlinkSync(filePath);
        
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "User not found" }));
      }
      
      const user = userResult.Item;
      
      // Convert file to base64 for storage
      const fileContent = fs.readFileSync(filePath);
      const fileBase64 = fileContent.toString('base64');
      
      // In real-world, you would likely upload this to S3 or similar
      // For this example, we're storing in DynamoDB
      // A more optimal solution would be to upload to S3 and store the URL
      
      // Create a URL-like structure for the signature
      // In a real application, this would be the S3 URL
      const signatureUrl = `data:${mimeType};base64,${fileBase64}`;
      const signatureUpdatedAt = new Date().toISOString();
      
      // Update the user record with the signature URL
      const updatedUser = {
        ...user,
        signatureUrl,
        signatureUpdatedAt
      };
      
      // Save the updated user data
      const updateUserParams = new PutCommand({
        TableName: "Users",
        Item: updatedUser
      });
      
      await dynamoDB.send(updateUserParams);
      
      // Clean up temporary file
      fs.unlinkSync(filePath);
      
      // Log the signature update activity
      await logActivity(userId, 'signature_updated', {
        userId,
        timestamp: formatDateTime(signatureUpdatedAt)
      });
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ 
        message: "Signature uploaded successfully",
        signatureUrl,
        signatureUpdatedAt: formatDateTime(signatureUpdatedAt)
      }));
      
    } catch (err) {
      console.error("Error uploading signature:", err);
      
      // Clean up temporary file if it exists
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
  
  req.pipe(busboyInstance);
}

// Delete user signature
else if (req.method === "DELETE" && req.url.match(/^\/users\/[^\/]+\/signature$/)) {
  // Extract userId from URL
  const userId = req.url.split("/")[2];
  
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  // Verify that the token user is authorized to delete this user's signature
  // Users can only delete their own signature
  const tokenUserId = tokenStore.get(token).userId;
  if (tokenUserId !== userId) {
    res.writeHead(403, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "You can only delete your own signature" }));
  }
  
  // Get the user data
  const getUserParams = new GetCommand({
    TableName: "Users",
    Key: {
      userId: userId
    }
  });
  
  dynamoDB.send(getUserParams)
    .then(async (data) => {
      if (!data.Item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "User not found" }));
      }
      
      const user = data.Item;
      
      // Check if user has a signature
      if (!user.signatureUrl) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "No signature found" }));
      }
      
      // Remove the signature URL from the user record
      const updatedUser = {
        ...user,
        signatureUrl: null,
        signatureUpdatedAt: null
      };
      
      // Save the updated user data
      const updateUserParams = new PutCommand({
        TableName: "Users",
        Item: updatedUser
      });
      
      await dynamoDB.send(updateUserParams);
      
      // Log the signature deletion activity
      await logActivity(userId, 'signature_deleted', {
        userId
      });
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Signature deleted successfully" }));
    })
    .catch((err) => {
      console.error("Error deleting signature:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    });
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
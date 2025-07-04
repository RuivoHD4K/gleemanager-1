const http = require("http");
const { PutCommand, ScanCommand, DeleteCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const dynamoDB = require("./database");
const crypto = require("crypto"); // Node.js built-in encryption library
const { v4: uuidv4 } = require("uuid"); // You'll need to install this: npm install uuid
const fs = require("fs");
const path = require("path");
const XlsxPopulate = require('xlsx-populate');
const ExcelJS = require('exceljs');
const busboy = require('busboy'); // You'll need to install this: npm install busboy
const MAX_ACTIVITIES = 50;
const activityLog = [];
const SESSION_FILE_PATH = path.join(__dirname, "sessions.json");
const onlineUsers = new Map();
let tokenStore = new Map();




// ## FUNCTIONS ##

function parseDate(dateString) {
  if (!dateString) return null;
  
  try {
    // Check if it's in DD/MM/YYYY format
    if (typeof dateString === 'string' && dateString.includes('/')) {
      const parts = dateString.split('/');
      if (parts.length === 3) {
        const [day, month, year] = parts;
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0]; // Return YYYY-MM-DD format
        }
      }
    }
    
    // If not DD/MM/YYYY format, try parsing as ISO date
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing date:', error);
    return null;
  }
}

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
  
  if (typeof dateString === 'string' && dateString.includes('/')) {
    // Check if it's in DD/MM/YYYY HH:MM format
    const dateTimeParts = dateString.split(' ');
    if (dateTimeParts.length >= 1) {
      const datePart = dateTimeParts[0];
      const timePart = dateTimeParts[1] || '00:00';

      const [day, month, year] = datePart.split('/');
      if (day && month && year) {
        date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        
        if (timePart) {
          const [hours, minutes] = timePart.split(':');
          if (hours && minutes) {
            date.setHours(parseInt(hours), parseInt(minutes));
          }
        }
      } else {
        date = new Date(dateString);
      }
    } else {
      date = new Date(dateString);
    }
  } else {
    date = new Date(dateString);
  }
  
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
  
  if (typeof dateString === 'string' && dateString.includes('/')) {
    const [day, month, year] = dateString.split('/');
    if (day && month && year) {
      date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    } else {
      date = new Date(dateString);
    }
  } else {
    date = new Date(dateString);
  }
  
  if (isNaN(date.getTime())) {
    return 'Invalid Date';
  }
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}/${month}/${year}`;
}

function formatUserData(user) {
  return {
    ...user,
    createdAt: formatDateTime(user.createdAt),
    lastSeen: user.lastSeen ? formatDateTime(user.lastSeen) : null,
    lastLogin: user.lastLogin ? formatDateTime(user.lastLogin) : null,
    signatureUpdatedAt: user.signatureUpdatedAt ? formatDateTime(user.signatureUpdatedAt) : null
  };
}

function formatProjectData(project) {
  return {
    ...project,
    projectStartDate: formatDate(project.projectStartDate),
    projectEndDate: project.projectEndDate ? formatDate(project.projectEndDate) : null,
    createdAt: formatDateTime(project.createdAt),
    updatedAt: formatDateTime(project.updatedAt)
  };
}

function formatCompanyData(company) {
  return {
    ...company,
    createdAt: formatDateTime(company.createdAt),
    updatedAt: formatDateTime(company.updatedAt)
  };
}

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


try {
  if (fs.existsSync(SESSION_FILE_PATH)) {
    const sessionsData = JSON.parse(fs.readFileSync(SESSION_FILE_PATH, 'utf8'));
    tokenStore = new Map(Object.entries(sessionsData).map(([token, session]) => {
      return [token, { ...session, expires: parseInt(session.expires) }];
    }));
    
    console.log(`Loaded ${tokenStore.size} sessions from disk`);
    
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
  tokenStore = new Map();
}

// Function to add a new activity to the log
const logActivity = async (userId, activityType, details = {}) => {
  try {
    let userInfo = { userId };
    
    if (userId) {
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
    
    const activity = {
      timestamp: new Date().toISOString(),
      userInfo,
      type: activityType,
      details
    };
    
    activityLog.unshift(activity);
    
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
  
  if (diffMs < 60000) {
    return "just now";
  }
  
  if (diffMs < 3600000) {
    const minutes = Math.floor(diffMs / 60000);
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  }
  
  if (diffMs < 86400000) {
    const hours = Math.floor(diffMs / 3600000);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  
  const days = Math.floor(diffMs / 86400000);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

// Function to save sessions to disk
function saveSessionsToDisk() {
  try {
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
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  const userId = tokenStore.get(token).userId;
  
  updateOnlineStatus(userId, true);
  
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "online" }));
};

// Set user as offline endpoint
const handleSetOffline = (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const userId = url.searchParams.get('userId');
  const token = url.searchParams.get('token');
  
  if (!userId || !token) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Missing userId or token" }));
  }
  
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
  
  updateOnlineStatus(userId, false);
  
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "offline" }));
};

// Get online users endpoint
const handleGetOnlineUsers = (req, res, token) => {
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
  for (const [token, session] of tokenStore.entries()) {
    if (session.userId === userId) {
      console.log(`Invalidating session for user ${userId}`);
      tokenStore.delete(token);
    }
  }
  
  onlineUsers.delete(userId);
  
  saveSessionsToDisk();
};

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  // Log all incoming requests for debugging
  console.log(`${req.method} ${req.url}`);

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
      // User related activities
      case 'user_created':
        message = `${username} created a new user: ${activity.details.email || 'New user'}`;
        break;
      case 'user_deleted':
        message = `${username} deleted user: ${activity.details.email || 'Unknown user'}`;
        break;
        
      // Project related activities
      case 'project_created':
        message = `${username} created a new project: ${activity.details.projectName || 'New project'}`;
        break;
      case 'project_deleted':
        message = `${username} deleted project: ${activity.details.projectName || 'Unknown project'}`;
        break;
      case 'project_assigned':
        message = `${username} assigned ${activity.details.projectName || 'a project'} to ${activity.details.username || 'a user'}`;
        break;
      case 'project_unassigned':
        message = `${username} removed ${activity.details.projectName || 'a project'} assignment from ${activity.details.username || 'a user'}`;
        break;
        
      // Company related activities
      case 'company_created':
        message = `${username} created a new company: ${activity.details.companyName || 'New company'}`;
        break;
      case 'company_deleted':
        message = `${username} deleted company: ${activity.details.companyName || 'Unknown company'}`;
        break;
        
      // Template related activities
      case 'template_uploaded':
        message = `${username} uploaded a new Excel template: ${activity.details.name || 'New template'}`;
        break;
      case 'template_deleted':
        message = `${username} deleted Excel template: ${activity.details.name || 'Unknown template'}`;
        break;
        
      // Route related activities
      case 'route_created':
        message = `${username} created a new route from ${activity.details.startLocation} to ${activity.details.destination}`;
        break;
      case 'route_deleted':
        message = `${username} deleted route from ${activity.details.startLocation} to ${activity.details.destination}`;
        break;
      case 'route_updated':
        message = `${username} updated route from ${activity.details.startLocation} to ${activity.details.destination}`;
        break;
        
      // Signature related activities
      case 'signature_updated':
        message = `${username} updated their signature`;
        break;
      case 'signature_deleted':
        message = `${username} deleted their signature`;
        break;
        
      // Holiday request related activities
      case 'holiday_requested':
        message = `${username} requested time off`;
        break;
      case 'holiday_approved':
        message = `${username} approved time off request for ${activity.details.username || 'a user'}`;
        break;
      case 'holiday_rejected':
        message = `${username} rejected time off request for ${activity.details.username || 'a user'})`;
        break;
      case 'holiday_request_canceled':
        message = `${username} canceled time off request)`;
        break;
      case 'holidays_removed':
        message = `${username} removed time off for user ${activity.details.userId || 'Unknown user'} (days: ${activity.details.days || 'Unknown dates'})`;
        break;
        
      // Add a specific message for any currently unknown activity type
      default:
        message = `${username} performed action: ${activity.type.replace(/_/g, ' ')}`;
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

// Update user personal details
else if (req.method === "PUT" && req.url.match(/^\/users\/[^\/]+\/personal-details$/)) {
  // Extract userId from URL
  const userId = req.url.split("/")[2];
  console.log("Personal details update request for userId:", userId);
  
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
      const personalData = JSON.parse(body);
      console.log("Personal details data received:", personalData);
      
      // Validate NIF if provided (Portuguese tax number - should be 9 digits)
      if (personalData.nif && !/^\d{9}$/.test(personalData.nif)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "NIF must be exactly 9 digits" }));
      }
      
      // Validate license plate length if provided
      if (personalData.licensePlate && personalData.licensePlate.length > 10) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "License plate cannot exceed 10 characters" }));
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
      
      const existingUser = userResult.Item;
      console.log("Found existing user:", existingUser.email);
      
      // Update user with new personal details
      const updatedUser = {
        ...existingUser,
        fullName: personalData.fullName || existingUser.fullName || "",
        address: personalData.address || existingUser.address || "",
        nif: personalData.nif || existingUser.nif || "",
        licensePlate: personalData.licensePlate ? personalData.licensePlate.toUpperCase() : (existingUser.licensePlate || ""),
        updatedAt: new Date().toISOString()
      };
      
      console.log("Updating user personal details:", {
        fullName: updatedUser.fullName,
        address: updatedUser.address ? 'Set' : 'Empty',
        nif: updatedUser.nif,
        licensePlate: updatedUser.licensePlate
      });
      
      const updateParams = new PutCommand({
        TableName: "Users",
        Item: updatedUser
      });
      
      await dynamoDB.send(updateParams);
      console.log("User personal details updated successfully");
      
      // Remove sensitive fields from response and format dates
      const { passwordHash, salt, ...safeUser } = updatedUser;
      const formattedUser = formatUserData(safeUser);
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        message: "Personal details updated successfully",
        user: formattedUser
      }));
    } catch (err) {
      console.error("Error updating user personal details:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

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

else if (req.method === "POST" && req.url === "/generate-kilometer-map") {
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized - Invalid or expired token" }));
  }

  const userId = tokenStore.get(token).userId;
  
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  
  req.on("end", async () => {
    try {
      let requestData;
      try {
        requestData = JSON.parse(body);
      } catch (parseError) {
        console.error('JSON parsing error:', parseError);
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Invalid JSON in request body" }));
      }
      
      // Validate request data
      if (!requestData.templateId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Template ID is required" }));
      }
      
      if (!requestData.selectedRoutes || !Array.isArray(requestData.selectedRoutes) || requestData.selectedRoutes.length === 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "At least one route must be selected" }));
      }
      
      if (!requestData.year || !requestData.month || !requestData.targetDistance) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Year, month, and target distance are required" }));
      }
      
      const year = parseInt(requestData.year);
      const month = parseInt(requestData.month);
      const targetDistance = parseFloat(requestData.targetDistance);
      
      // Define Portuguese months array
      const PORTUGUESE_MONTHS = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
      ];
      const monthNamePT = PORTUGUESE_MONTHS[month - 1];
      
      if (targetDistance <= 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Target distance must be greater than 0" }));
      }
      
      // Get the template from database
      const templateParams = new GetCommand({
        TableName: "ExcelTemplates",
        Key: { templateId: requestData.templateId }
      });
      
      const templateResult = await dynamoDB.send(templateParams);
      
      if (!templateResult.Item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: `Template with ID ${requestData.templateId} not found` }));
      }
      
      const template = templateResult.Item;
      
      // Get user personal details
      const userParams = new GetCommand({
        TableName: "Users",
        Key: { userId }
      });
      
      const userResult = await dynamoDB.send(userParams);
      
      if (!userResult.Item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "User not found" }));
      }
      
      const userDetails = userResult.Item;
      
      // Get selected routes from database
      const routePromises = requestData.selectedRoutes.map(routeId => {
        return dynamoDB.send(new GetCommand({
          TableName: "Routes",
          Key: { routeId }
        }));
      });
      
      const routeResults = await Promise.all(routePromises);
      const selectedRouteData = routeResults
        .filter(result => result.Item)
        .map(result => result.Item);
      
      if (selectedRouteData.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "No valid routes found with the provided IDs" }));
      }
      
      // Get user holidays for the specified month
      const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
      let userHolidays = [];
      
      try {
        const userHolidaysParams = new ScanCommand({
          TableName: "UserHolidays",
          FilterExpression: "userId = :userId AND yearMonth = :yearMonth",
          ExpressionAttributeValues: {
            ":userId": userId,
            ":yearMonth": yearMonth
          }
        });
        
        const userHolidaysResult = await dynamoDB.send(userHolidaysParams);
        if (userHolidaysResult.Items && userHolidaysResult.Items.length > 0) {
          userHolidays = userHolidaysResult.Items[0].days || [];
        }
      } catch (holidayError) {
        console.warn('Could not fetch user holidays:', holidayError);
      }
      
      // Get national holidays for Portugal
      let nationalHolidays = [];
      
      try {
        const https = require('https');
        
        const makeRequest = (url) => {
          return new Promise((resolve, reject) => {
            const req = https.get(url, (res) => {
              let data = '';
              
              res.on('data', (chunk) => {
                data += chunk;
              });
              
              res.on('end', () => {
                if (res.statusCode === 200) {
                  try {
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                  } catch (parseError) {
                    reject(new Error('Failed to parse holiday API response'));
                  }
                } else {
                  reject(new Error(`Holiday API returned status ${res.statusCode}`));
                }
              });
            });
            
            req.on('error', (error) => {
              reject(error);
            });
            
            req.setTimeout(10000, () => {
              req.destroy();
              reject(new Error('Holiday API request timeout'));
            });
          });
        };
        
        const nationalData = await makeRequest(`https://date.nager.at/api/v3/PublicHolidays/${year}/PT`);
        nationalHolidays = nationalData
          .filter(holiday => holiday.date.startsWith(`${year}-${String(month).padStart(2, '0')}`))
          .map(holiday => parseInt(holiday.date.substring(8, 10), 10));
      } catch (holidayError) {
        console.warn('Could not fetch national holidays:', holidayError.message);
      }
      
      // Calculate valid days (excluding weekends, user holidays, national holidays)
      const daysInMonth = new Date(year, month, 0).getDate();
      const validDays = [];
      
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isUserHoliday = userHolidays.includes(day);
        const isNationalHoliday = nationalHolidays.includes(day);
        
        // Skip weekends and holidays
        if (!isWeekend && !isUserHoliday && !isNationalHoliday) {
          validDays.push(day);
        }
      }
      
      if (validDays.length === 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ 
          error: "No valid working days available for the selected month",
          details: {
            daysInMonth,
            userHolidays,
            nationalHolidays,
            weekendsExcluded: true
          }
        }));
      }
      
      // Find optimal route combination
      const findOptimalRoutesCombination = () => {
        const maxDays = validDays.length;
        const target = targetDistance;

        // Sort routes ascending by distance to facilitate pruning
        const sortedRoutes = selectedRouteData.sort((a, b) => a.routeLength - b.routeLength);
        const n = sortedRoutes.length;

        let bestCombination = null;
        let closestAboveTarget = Infinity;

        const backtrack = (index, selectedRoutes, totalDistance) => {
          if (selectedRoutes.length > maxDays) return; // One route per valid day max
          if (totalDistance >= target && totalDistance < closestAboveTarget) {
            closestAboveTarget = totalDistance;
            bestCombination = [...selectedRoutes];
            return;
          }

          if (index >= n || totalDistance >= closestAboveTarget) return;

          // Include current route
          backtrack(
            index + 1,
            [...selectedRoutes, sortedRoutes[index]],
            totalDistance + sortedRoutes[index].routeLength
          );

          // Exclude current route
          backtrack(index + 1, selectedRoutes, totalDistance);
        };

        backtrack(0, [], 0);

        if (bestCombination) {
          return {
            routes: bestCombination,
            totalDistance: bestCombination.reduce((sum, r) => sum + r.routeLength, 0),
            excess: bestCombination.reduce((sum, r) => sum + r.routeLength, 0) - target
          };
        }

        return null; // fallback will trigger if no valid combination is found
      };
      
      let optimalCombination = findOptimalRoutesCombination();
      
      if (!optimalCombination) {
        // Try a simple greedy approach as fallback
        const combination = [];
        let totalDistance = 0;
        const sortedRoutes = selectedRouteData.sort((a, b) => a.routeLength - b.routeLength);
        
        while (totalDistance < targetDistance && combination.length < 300) {
          const remaining = targetDistance - totalDistance;
          let bestRoute = sortedRoutes[0];
          
          for (const route of sortedRoutes) {
            if (route.routeLength <= remaining * 1.2) {
              bestRoute = route;
            }
          }
          
          combination.push(bestRoute);
          totalDistance += bestRoute.routeLength;
        }
        
        if (totalDistance >= targetDistance) {
          optimalCombination = {
            routes: combination,
            totalDistance: totalDistance,
            excess: totalDistance - targetDistance
          };
        } else {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ 
            error: `Cannot reach target distance ${targetDistance}km with selected routes`,
            details: {
              maxPossible: totalDistance,
              selectedRoutes: selectedRouteData.map(r => ({
                name: `${r.startLocation} → ${r.destination}`,
                distance: r.routeLength
              }))
            }
          }));
        }
      }
      
      // Check if we have too many routes for available days
      const maxPossibleRoutes = validDays.length * 3; // Allow up to 3 routes per day maximum
      if (optimalCombination.routes.length > maxPossibleRoutes) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ 
          error: `Target distance ${targetDistance}km requires ${optimalCombination.routes.length} routes, but only ${validDays.length} working days available (max ${maxPossibleRoutes} routes)`,
          details: {
            requiredRoutes: optimalCombination.routes.length,
            availableDays: validDays.length,
            maxPossibleRoutes: maxPossibleRoutes,
            suggestion: "Reduce target distance or select routes with larger distances"
          }
        }));
      }
      
      // Distribute routes randomly across valid days
      const distribution = [];
      const routesToDistribute = [...optimalCombination.routes];
      
      // Shuffle routes for better distribution
      for (let i = routesToDistribute.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [routesToDistribute[i], routesToDistribute[j]] = [routesToDistribute[j], routesToDistribute[i]];
      }
      
      // If we have more routes than available days, we'll need to assign multiple routes per day
      const routesPerDay = Math.ceil(routesToDistribute.length / validDays.length);
      const maxRoutesPerDay = Math.min(routesPerDay, 3); // Limit to 3 routes per day
      
      // Track how many routes we've assigned to each day
      const dayRouteCount = {};
      validDays.forEach(day => dayRouteCount[day] = 0);
      
      // Distribute routes randomly
      for (let i = 0; i < routesToDistribute.length; i++) {
        const route = routesToDistribute[i];
        
        // Find days that haven't reached the maximum routes per day
        const availableForAssignment = validDays.filter(day => dayRouteCount[day] < maxRoutesPerDay);
        
        // If all days are at capacity, reset the counter
        if (availableForAssignment.length === 0) {
          validDays.forEach(day => dayRouteCount[day] = 0);
          availableForAssignment.push(...validDays);
        }
        
        // Randomly select a day from available days
        const randomIndex = Math.floor(Math.random() * availableForAssignment.length);
        const assignedDay = availableForAssignment[randomIndex];
        
        // Increment the counter for this day
        dayRouteCount[assignedDay]++;
        
        const date = new Date(year, month - 1, assignedDay);
        
        distribution.push({
          day: assignedDay,
          date: date.toISOString().split('T')[0],
          route: route,
          distance: route.routeLength,
          routeIndex: i + 1
        });
      }
      
      // Generate Excel file with xlsx-populate (preserves ALL formatting)
      if (!template.fileContent) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Template file content is missing" }));
      }
      
      // Decode template file to buffer
      const templateBuffer = Buffer.from(template.fileContent, 'base64');
      
      // Load the existing workbook with xlsx-populate (preserves ALL formatting)
      const workbook = await XlsxPopulate.fromDataAsync(templateBuffer);
      
      // Get the first worksheet
      const worksheet = workbook.sheet(0);
      
      // Clear existing data in rows 9-39 (days 1-31) while preserving ALL formatting
      for (let day = 1; day <= 31; day++) {
        const rowIndex = 8 + day;
        
        // Clear columns B, C, F but preserve ALL formatting
        ['B', 'C', 'F'].forEach(col => {
          const cellRef = `${col}${rowIndex}`;
          worksheet.cell(cellRef).value('');
        });
      }
      
      // Create day-to-route mapping
      const dayRouteMap = {};
      distribution.forEach(entry => {
        if (!dayRouteMap[entry.day]) {
          dayRouteMap[entry.day] = [];
        }
        dayRouteMap[entry.day].push(entry);
      });
      
      // Fill Excel with route data while preserving ALL formatting
      let cellsUpdated = 0;
      for (let day = 1; day <= daysInMonth; day++) {
        if (dayRouteMap[day] && dayRouteMap[day].length > 0) {
          // Use the first route for this day
          const entry = dayRouteMap[day][0];
          const rowIndex = 8 + day;
          
          // Update cell values - xlsx-populate automatically preserves ALL formatting
          worksheet.cell(`B${rowIndex}`).value(entry.route.startLocation);
          worksheet.cell(`C${rowIndex}`).value(entry.route.destination);
          worksheet.cell(`F${rowIndex}`).value(entry.route.routeLength);
          
          cellsUpdated++;
        }
      }
      
      // SET PORTUGUESE MONTH AND YEAR
      worksheet.cell('E6').value(monthNamePT);
      worksheet.cell('F6').value(year);
      
      // SET PERSONAL DETAILS
      worksheet.cell('B45').value(userDetails.fullName || '');
      worksheet.cell('B46').value(userDetails.address || '');
      worksheet.cell('E45').value(userDetails.nif || '');
      worksheet.cell('E46').value(userDetails.licensePlate || '');
      
      // SET CURRENT DATE IN B47
      const currentDate = new Date();
      const formattedDate = `${String(currentDate.getDate()).padStart(2, '0')}/${String(currentDate.getMonth() + 1).padStart(2, '0')}/${currentDate.getFullYear()}`;
      worksheet.cell('B47').value(formattedDate);
      
      // Generate the xlsx-populate buffer first (preserves all formatting)
      let modifiedBuffer = await workbook.outputAsync();
      
      // === SIGNATURE PROCESSING WITH EXCELJS ===
      console.log('=== SIGNATURE PROCESSING START ===');
      let signatureAdded = false;
      
      if (userDetails.signatureUrl) {
        console.log('✅ User has signatureUrl field');
        console.log('SignatureUrl type:', typeof userDetails.signatureUrl);
        console.log('SignatureUrl length:', userDetails.signatureUrl.length);
        console.log('SignatureUrl first 100 chars:', userDetails.signatureUrl.substring(0, 100));
        
        try {
          // Extract base64 data from data URL (format: data:image/png;base64,...)
          console.log('🔍 Attempting to parse signature URL format...');
          const base64Match = userDetails.signatureUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
          
          if (base64Match) {
            console.log('✅ Signature URL format is valid data URL');
            console.log('Image type detected:', userDetails.signatureUrl.match(/^data:image\/([^;]+);/)[1]);
            
            const base64Data = base64Match[1];
            console.log('Base64 data length:', base64Data.length);
            console.log('Base64 data first 50 chars:', base64Data.substring(0, 50));
            
            try {
              console.log('🔄 Creating buffer from base64 data...');
              const signatureBuffer = Buffer.from(base64Data, 'base64');
              console.log('✅ Buffer created successfully, size:', signatureBuffer.length, 'bytes');
              
              // Now use ExcelJS to add the image to the already-processed workbook
              console.log('🔄 Loading workbook with ExcelJS for image insertion...');
              const excelWorkbook = new ExcelJS.Workbook();
              
              console.log('🔄 Reading xlsx-populate buffer with ExcelJS...');
              await excelWorkbook.xlsx.load(modifiedBuffer);
              console.log('✅ ExcelJS workbook loaded successfully');
              
              const excelWorksheet = excelWorkbook.getWorksheet(1); // Get first worksheet
              console.log('✅ ExcelJS worksheet obtained');
              
              console.log('🔄 Adding image to ExcelJS workbook...');
              const imageId = excelWorkbook.addImage({
                buffer: signatureBuffer,
                extension: 'jpeg', // or 'png' based on the image type
              });
              console.log('✅ Image added to ExcelJS workbook, imageId:', imageId);
              
              console.log('🔄 Positioning image in cell D47...');
              // Add image to cell D47
              excelWorksheet.addImage(imageId, {
                tl: { col: 3, row: 46 }, // D47 (0-indexed: D=3, 47=46)
                ext: { width: 100, height: 50 }
              });
              console.log('✅ Image positioned in D47 successfully');
              
              console.log('🔄 Generating final buffer with ExcelJS...');
              modifiedBuffer = await excelWorkbook.xlsx.writeBuffer();
              console.log('✅ Final buffer generated with image');
              
              signatureAdded = true;
              console.log('🎉 Successfully added signature image to D47 using ExcelJS');
              
            } catch (excelJsError) {
              console.error('❌ Error with ExcelJS image processing:', excelJsError);
              console.error('ExcelJS error type:', excelJsError.constructor.name);
              console.error('ExcelJS error message:', excelJsError.message);
              console.error('ExcelJS error stack:', excelJsError.stack);
              // Continue without image - don't fail the entire operation
            }
            
          } else {
            console.log('❌ Invalid signature URL format - regex match failed');
            console.log('Expected format: data:image/{type};base64,{data}');
            console.log('Actual format check:');
            console.log('- Starts with "data:image/":', userDetails.signatureUrl.startsWith('data:image/'));
            console.log('- Contains ";base64,":', userDetails.signatureUrl.includes(';base64,'));
            console.log('- Full URL length:', userDetails.signatureUrl.length);
          }
        } catch (imageError) {
          console.error('❌ Error processing signature image:', imageError);
          console.error('Image error type:', imageError.constructor.name);
          console.error('Image error message:', imageError.message);
          console.error('Image error stack:', imageError.stack);
        }
      } else {
        console.log('❌ No signatureUrl found in user details');
        console.log('User details keys:', Object.keys(userDetails));
        console.log('SignatureUrl value:', userDetails.signatureUrl);
      }
      
      console.log('Signature added result:', signatureAdded);
      console.log('=== SIGNATURE PROCESSING END ===');
      
      // Log activity
      try {
        await logActivity(userId, 'kilometer_map_generated', {
          templateName: template.name,
          month: `${monthNamePT} ${year}`,
          routeCount: distribution.length,
          daysWithRoutes: Object.keys(dayRouteMap).length,
          totalDistance: optimalCombination.totalDistance,
          targetDistance: targetDistance,
          monthInserted: monthNamePT,
          yearInserted: year,
          personalDetailsAdded: true,
          signatureAdded: signatureAdded, // Log whether signature was added
          currentDateAdded: formattedDate
        });
      } catch (logError) {
        console.error('Error logging activity:', logError);
      }
      
      // Send file as download
      const filename = `kilometer_map_${year}_${String(month).padStart(2, '0')}.xlsx`;
      
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Length', modifiedBuffer.length);
      
      console.log('=== KILOMETER MAP GENERATION SUCCESS ===');
      console.log(`File: ${filename} (${modifiedBuffer.length} bytes)`);
      console.log(`Routes: ${distribution.length} across ${Object.keys(dayRouteMap).length} days`);
      console.log(`Distance: ${optimalCombination.totalDistance.toFixed(1)}km (target: ${targetDistance}km, excess: ${optimalCombination.excess.toFixed(1)}km)`);
      console.log(`Portuguese Month: ${monthNamePT} ${year}`);
      console.log(`Personal Details: ${userDetails.fullName || 'N/A'}, ${userDetails.address || 'N/A'}, ${userDetails.nif || 'N/A'}, ${userDetails.licensePlate || 'N/A'}`);
      console.log(`Signature Added: ${signatureAdded ? 'Yes' : 'No'}`);
      console.log(`Current Date: ${formattedDate}`);
      
      res.writeHead(200);
      res.end(modifiedBuffer);
      
    } catch (err) {
      console.error("=== KILOMETER MAP GENERATION ERROR ===");
      console.error("Error:", err);
      console.error("Stack:", err.stack);
      
      let errorMessage = "Failed to generate kilometer map";
      
      if (err.message.includes('Template')) {
        errorMessage = "Template processing error: " + err.message;
      } else if (err.message.includes('XLSX') || err.message.includes('Excel')) {
        errorMessage = "Excel file processing error: " + err.message;
      } else if (err.message.includes('DynamoDB')) {
        errorMessage = "Database error: " + err.message;
      } else if (err.message.includes('Holiday')) {
        errorMessage = "Holiday validation error: " + err.message;
      } else {
        errorMessage = "Server error: " + err.message;
      }
      
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ 
        error: errorMessage,
        details: err.message,
        timestamp: new Date().toISOString()
      }));
    }
  });
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

else if (req.method === "POST" && req.url.match(/^\/holiday-requests$/)) {
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  const userId = tokenStore.get(token).userId;
  
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  
  req.on("end", async () => {
    try {
      const requestData = JSON.parse(body);
      
      // Validate request data
      if (!requestData.dates || !Array.isArray(requestData.dates) || requestData.dates.length === 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "At least one date is required" }));
      }
      
      // Get user information
      const userParams = new GetCommand({
        TableName: "Users",
        Key: { userId }
      });
      
      const userResult = await dynamoDB.send(userParams);
      
      if (!userResult.Item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "User not found" }));
      }
      
      const user = userResult.Item;
      
      // Generate a unique request ID
      const requestId = "holiday-" + uuidv4().substring(0, 8);
      
      // Create the holiday request
      const holidayRequest = {
        requestId,
        userId,
        username: user.username || user.email.split('@')[0],
        dates: requestData.dates,
        status: "pending",
        requestDate: new Date().toISOString(),
        approvedBy: null,
        approvedAt: null,
        notes: requestData.notes || ""
      };
      
      const params = new PutCommand({
        TableName: "HolidayRequests",
        Item: holidayRequest
      });
      
      await dynamoDB.send(params);
      
      // Log the holiday request
      await logActivity(userId, 'holiday_requested', {
        requestId,
        username: holidayRequest.username,
        dates: requestData.dates.join(', ')
      });
      
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        message: "Holiday request submitted successfully",
        requestId
      }));
    } catch (err) {
      console.error("Error creating holiday request:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

// 2. Get all holiday requests for a user
else if (req.method === "GET" && req.url.match(/^\/users\/[^\/]+\/holiday-requests$/)) {
  // Extract userId from URL
  const targetUserId = req.url.split("/")[2];
  
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  // Get user ID from token
  const currentUserId = tokenStore.get(token).userId;
  
  // Check if user is requesting their own requests or is an admin
  (async () => {
    try {
      // Get the current user to check role
      const userParams = new GetCommand({
        TableName: "Users",
        Key: { userId: currentUserId }
      });
      
      const userResult = await dynamoDB.send(userParams);
      
      if (!userResult.Item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "User not found" }));
      }
      
      const user = userResult.Item;
      const isAdmin = user.role === "admin";
      
      // Allow access to all approved holiday requests
      const params = new ScanCommand({
        TableName: "HolidayRequests",
        FilterExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":userId": targetUserId
        }
      });
      
      const result = await dynamoDB.send(params);
      
      // For regular users, we'll only return approved requests with limited information
      // For admins, return all requests with full information
      let requestsToReturn = result.Items || [];
      
      if (!isAdmin && currentUserId !== targetUserId) {
        // For other users' requests, only return approved requests with limited info
        requestsToReturn = requestsToReturn
          .filter(req => req.status === "approved")
          .map(req => ({
            requestId: req.requestId,
            userId: req.userId,
            username: req.username,
            dates: req.dates,
            status: req.status,
            notes: req.notes // Keep notes so comments are visible
          }));
      }
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(requestsToReturn));
    } catch (err) {
      console.error("Error fetching holiday requests:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  })();
}

// 3. Get pending holiday requests (admin only)
else if (req.method === "GET" && req.url === "/holiday-requests/pending") {
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  // Get user ID from token
  const currentUserId = tokenStore.get(token).userId;
  
  (async () => {
    try {
      // Get the current user to check role
      const userParams = new GetCommand({
        TableName: "Users",
        Key: { userId: currentUserId }
      });
      
      const userResult = await dynamoDB.send(userParams);
      
      if (!userResult.Item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "User not found" }));
      }
      
      const user = userResult.Item;
      
      // Verify user is admin
      if (user.role !== "admin") {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Admin access required" }));
      }
      
      // Fetch pending holiday requests
      const params = new ScanCommand({
        TableName: "HolidayRequests",
        FilterExpression: "#status = :status",
        ExpressionAttributeNames: {
          "#status": "status" // 'status' is a reserved word in DynamoDB
        },
        ExpressionAttributeValues: {
          ":status": "pending"
        }
      });
      
      const result = await dynamoDB.send(params);
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result.Items || []));
    } catch (err) {
      console.error("Error fetching pending holiday requests:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  })();
}

// 4. Approve or reject a holiday request (admin only)
else if (req.method === "PUT" && req.url.match(/^\/holiday-requests\/[^\/]+\/status$/)) {
  // Extract requestId from URL
  const requestId = req.url.split("/")[2];
  
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  // Get admin ID from token
  const adminUserId = tokenStore.get(token).userId;
  
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  
  req.on("end", async () => {
    try {
      const statusData = JSON.parse(body);
      
      // Validate status
      if (!statusData.status || (statusData.status !== "approved" && statusData.status !== "rejected")) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Valid status (approved or rejected) is required" }));
      }
      
      // Get the admin user to check role
      const userParams = new GetCommand({
        TableName: "Users",
        Key: { userId: adminUserId }
      });
      
      const userResult = await dynamoDB.send(userParams);
      
      if (!userResult.Item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "User not found" }));
      }
      
      const adminUser = userResult.Item;
      
      // Verify user is admin
      if (adminUser.role !== "admin") {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Admin access required" }));
      }
      
      // Get the holiday request
      const getParams = new GetCommand({
        TableName: "HolidayRequests",
        Key: { requestId }
      });
      
      const result = await dynamoDB.send(getParams);
      
      if (!result.Item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Holiday request not found" }));
      }
      
      const holidayRequest = result.Item;
      
      // Only pending requests can be approved/rejected
      if (holidayRequest.status !== "pending") {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: `Request is already ${holidayRequest.status}` }));
      }
      
      // Update the request status
      const now = new Date().toISOString();
      const updatedRequest = {
        ...holidayRequest,
        status: statusData.status,
        approvedBy: adminUserId,
        approvedAt: now,
        notes: statusData.notes ? `${holidayRequest.notes}\nAdmin: ${statusData.notes}` : holidayRequest.notes
      };
      
      const updateParams = new PutCommand({
        TableName: "HolidayRequests",
        Item: updatedRequest
      });
      
      await dynamoDB.send(updateParams);
      
      // If request is approved, update the UserHolidays table
      if (statusData.status === "approved") {
        // Process each date to update the appropriate month records
        const monthMap = {};
        
        // Group dates by year-month
        holidayRequest.dates.forEach(dateStr => {
          const [year, month, day] = dateStr.split('-');
          const yearMonth = `${year}-${month}`;
          const dayNum = parseInt(day, 10);
          
          if (!monthMap[yearMonth]) {
            monthMap[yearMonth] = [];
          }
          
          monthMap[yearMonth].push(dayNum);
        });
        
        // Update or create entries in UserHolidays table for each month
        for (const [yearMonth, days] of Object.entries(monthMap)) {
          // Check if an entry already exists for this user and month
          const getHolidayParams = new ScanCommand({
            TableName: "UserHolidays",
            FilterExpression: "userId = :userId AND yearMonth = :yearMonth",
            ExpressionAttributeValues: {
              ":userId": holidayRequest.userId,
              ":yearMonth": yearMonth
            }
          });
          
          const holidayResult = await dynamoDB.send(getHolidayParams);
          
          if (holidayResult.Items && holidayResult.Items.length > 0) {
            // Update existing record
            const existingRecord = holidayResult.Items[0];
            const existingDays = new Set(existingRecord.days);
            
            // Add new days to the set (avoids duplicates)
            days.forEach(day => existingDays.add(day));
            
            // Update metadata
            const updatedMetadata = existingRecord.metadata || { requestIds: [], dayInfo: {} };
            
            // Add request ID if not already present
            if (!updatedMetadata.requestIds.includes(requestId)) {
              updatedMetadata.requestIds.push(requestId);
            }
            
            // Add day info
            days.forEach(day => {
              updatedMetadata.dayInfo[day] = {
                type: "vacation",
                requestId: requestId
              };
            });
            
            // Save updated record
            const updateHolidayParams = new PutCommand({
              TableName: "UserHolidays",
              Item: {
                ...existingRecord,
                days: Array.from(existingDays),
                lastUpdated: now,
                metadata: updatedMetadata
              }
            });
            
            await dynamoDB.send(updateHolidayParams);
          } else {
            // Create new record
            const holidayId = `holiday-${holidayRequest.userId}-${yearMonth}`;
            
            const metadata = {
              requestIds: [requestId],
              dayInfo: {}
            };
            
            // Add day info
            days.forEach(day => {
              metadata.dayInfo[day] = {
                type: "vacation",
                requestId: requestId
              };
            });
            
            const newHolidayParams = new PutCommand({
              TableName: "UserHolidays",
              Item: {
                holidayId,
                userId: holidayRequest.userId,
                yearMonth,
                days,
                lastUpdated: now,
                metadata
              }
            });
            
            await dynamoDB.send(newHolidayParams);
          }
        }
      }
      
      // Log the approval/rejection
      await logActivity(adminUserId, `holiday_${statusData.status}`, {
        requestId,
        username: holidayRequest.username,
        dates: holidayRequest.dates.join(', ')
      });
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        message: `Holiday request ${statusData.status} successfully`,
        requestId
      }));
    } catch (err) {
      console.error(`Error ${statusData?.status || 'updating'} holiday request:`, err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

// 5. Cancel a holiday request (user can cancel their own pending requests)
else if (req.method === "DELETE" && req.url.match(/^\/holiday-requests\/[^\/]+$/)) {
  // Extract requestId from URL
  const requestId = req.url.split("/")[2];
  
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  // Get user ID from token
  const currentUserId = tokenStore.get(token).userId;
  
  (async () => {
    try {
      // Get the holiday request
      const getParams = new GetCommand({
        TableName: "HolidayRequests",
        Key: { requestId }
      });
      
      const result = await dynamoDB.send(getParams);
      
      if (!result.Item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Holiday request not found" }));
      }
      
      const holidayRequest = result.Item;
      
      // Check if user is admin
      const userParams = new GetCommand({
        TableName: "Users",
        Key: { userId: currentUserId }
      });
      
      const userResult = await dynamoDB.send(userParams);
      
      if (!userResult.Item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "User not found" }));
      }
      
      const isAdmin = userResult.Item.role === "admin";
      
      // Check if user is authorized to cancel the request
      if (currentUserId !== holidayRequest.userId && !isAdmin) {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Unauthorized to cancel this request" }));
      }
      
      // If not admin, only pending requests can be canceled
      if (!isAdmin && holidayRequest.status !== "pending") {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Only pending requests can be canceled" }));
      }
      
      // Delete the request
      const deleteParams = new DeleteCommand({
        TableName: "HolidayRequests",
        Key: { requestId }
      });
      
      await dynamoDB.send(deleteParams);
      
      // Log the cancellation
      await logActivity(currentUserId, 'holiday_request_canceled', {
        requestId,
        username: holidayRequest.username,
        dates: holidayRequest.dates.join(', ')
      });
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        message: "Holiday request canceled successfully",
        requestId
      }));
    } catch (err) {
      console.error("Error canceling holiday request:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  })();
}

// 6. Get user holidays for a specific month
else if (req.method === "GET" && req.url.match(/^\/users\/[^\/]+\/holidays\/\d{4}-\d{2}$/)) {
  // Extract userId and yearMonth from URL
  const urlParts = req.url.split("/");
  const userId = urlParts[2];
  const yearMonth = urlParts[4];
  
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  // Get current user ID from token
  const currentUserId = tokenStore.get(token).userId;
  
  (async () => {
    try {      
      // Get holidays for the specified user and month
      const params = new ScanCommand({
        TableName: "UserHolidays",
        FilterExpression: "userId = :userId AND yearMonth = :yearMonth",
        ExpressionAttributeValues: {
          ":userId": userId,
          ":yearMonth": yearMonth
        }
      });
      
      const result = await dynamoDB.send(params);
      
      // If no record found, return empty days array
      if (!result.Items || result.Items.length === 0) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ userId, yearMonth, days: [] }));
      }
      
      // Return the holiday record
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result.Items[0]));
    } catch (err) {
      console.error("Error fetching user holidays:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  })();
}

// 7. Remove specific holidays from a month (user removing their own approved holidays)
else if (req.method === "DELETE" && req.url.match(/^\/users\/[^\/]+\/holidays\/\d{4}-\d{2}$/)) {
  // Extract userId and yearMonth from URL
  const urlParts = req.url.split("/");
  const userId = urlParts[2];
  const yearMonth = urlParts[4];
  
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  // Get current user ID from token
  const currentUserId = tokenStore.get(token).userId;
  
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  
  req.on("end", async () => {
    try {
      const data = JSON.parse(body);
      
      // Validate request data
      if (!data.days || !Array.isArray(data.days) || data.days.length === 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "At least one day must be specified" }));
      }
      
      // Ensure all days are integers
      const daysToRemove = data.days.map(day => parseInt(day, 10));
      
      // Check if current user is the user or an admin
      let isAdmin = false;
      if (currentUserId !== userId) {
        const userParams = new GetCommand({
          TableName: "Users",
          Key: { userId: currentUserId }
        });
        
        const userResult = await dynamoDB.send(userParams);
        
        if (!userResult.Item || userResult.Item.role !== "admin") {
          res.writeHead(403, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Unauthorized to modify these holidays" }));
        }
        
        isAdmin = true;
      }
      
      // Get holidays for the specified user and month
      const getParams = new ScanCommand({
        TableName: "UserHolidays",
        FilterExpression: "userId = :userId AND yearMonth = :yearMonth",
        ExpressionAttributeValues: {
          ":userId": userId,
          ":yearMonth": yearMonth
        }
      });
      
      const result = await dynamoDB.send(getParams);
      
      // If no record found, nothing to remove
      if (!result.Items || result.Items.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "No holidays found for this month" }));
      }
      
      const holidayRecord = result.Items[0];
      
      // Remove the specified days
      const updatedDays = holidayRecord.days.filter(day => !daysToRemove.includes(day));
      
      // Update metadata
      const updatedMetadata = { ...holidayRecord.metadata };
      
      // Remove day info for removed days
      daysToRemove.forEach(day => {
        if (updatedMetadata.dayInfo && updatedMetadata.dayInfo[day]) {
          delete updatedMetadata.dayInfo[day];
        }
      });
      
      // Update the record
      const updateParams = new PutCommand({
        TableName: "UserHolidays",
        Item: {
          ...holidayRecord,
          days: updatedDays,
          lastUpdated: new Date().toISOString(),
          metadata: updatedMetadata
        }
      });
      
      await dynamoDB.send(updateParams);
      
      // Log the removal
      await logActivity(currentUserId, 'holidays_removed', {
        userId,
        yearMonth,
        days: daysToRemove.join(', ')
      });
      
      // Return the updated holiday record
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        message: "Holidays removed successfully",
        userId,
        yearMonth,
        removedDays: daysToRemove,
        remainingDays: updatedDays
      }));
    } catch (err) {
      console.error("Error removing holidays:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

// Get national holidays for a specific country and year
else if (req.method === "GET" && req.url.match(/^\/national-holidays\/[A-Z]{2}\/\d{4}$/)) {
  // Extract country code and year from URL
  const urlParts = req.url.split("/");
  const countryCode = urlParts[2];
  const year = urlParts[3];
  
  // Check if token is valid
  if (!token || !tokenStore.has(token) || tokenStore.get(token).expires < Date.now()) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }
  
  // This endpoint only supports Portugal
  if (countryCode !== "PT") {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Only Portugal (PT) is supported for holiday data" }));
  }
  
  (async () => {
    try {
      // Directly fetch from the nager.date API for Portugal holidays
      const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/PT`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch holidays: ${response.status} ${response.statusText}`);
      }
      
      const holidays = await response.json();
      
      // Format the holidays for our response
      const formattedHolidays = holidays.map(holiday => ({
        date: holiday.date,
        name: holiday.localName,
        englishName: holiday.name,
        type: holiday.types[0] || "Public"
      }));
      
      // Log the successful fetch
      console.log(`Successfully fetched ${formattedHolidays.length} holidays for Portugal in ${year}`);
      
      // Return the holidays directly without storing in database
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(formattedHolidays));
      
    } catch (err) {
      console.error("Error fetching Portugal holidays:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ 
        error: "Failed to fetch holiday data", 
        details: err.message 
      }));
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
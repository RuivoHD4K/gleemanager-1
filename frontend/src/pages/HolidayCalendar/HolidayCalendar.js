import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Filter, Calendar as CalendarIcon, MessageSquare, RefreshCw } from 'lucide-react';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useToast } from '../../components/Toast/ToastContext';
import './HolidayCalendar.css';

// Custom Tooltip component that follows the mouse
const CommentTooltip = ({ text, username, children }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  
  const handleMouseEnter = () => {
    setIsVisible(true);
  };
  
  const handleMouseLeave = () => {
    setIsVisible(false);
  };
  
  const handleMouseMove = (e) => {
    // Position the tooltip above the cursor
    setPosition({
      x: e.clientX, 
      y: e.clientY - 40 // 40px above cursor
    });
  };
  
  // Clean the comment text by removing "Admin: Request approved by admin"
  const cleanedText = text ? text.replace(/Admin: Request approved by admin/gi, '').trim() : '';

  return (
    <div 
      className="tooltip-container"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      {children}
      
      {isVisible && (cleanedText || username) && (
        <div 
          className="tooltip" 
          style={{ 
            left: `${position.x}px`, 
            top: `${position.y}px`,
            transform: 'translate(-50%, -100%)',
            opacity: isVisible ? 1 : 0
          }}
        >
          {username && (
            <div className="tooltip-username">
              <strong>{username}</strong>
            </div>
          )}
          {cleanedText && <div className="tooltip-comment">{cleanedText}</div>}
        </div>
      )}
    </div>
  );
};

const HolidayCalendar = () => {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [nationalHolidays, setNationalHolidays] = useState([]);
  const [userHolidays, setUserHolidays] = useState({});
  const [holidayRequests, setHolidayRequests] = useState([]);
  const [showFilter, setShowFilter] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debugMode, setDebugMode] = useState(false); // Debug mode (hidden in production)
  // Add a new state to store the user holiday spans with assigned slots
  const [holidaySpans, setHolidaySpans] = useState({});
  const filterRef = useRef(null);
  
  // Debug logging function
  const debug = (message, data) => {
    if (debugMode) {
      console.log(`[DEBUG] ${message}`, data);
    }
  };
  
  // Format date for display (YYYY-MM-DD to DD/MM/YYYY)
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Format year-month for API (YYYY-MM)
  const formatYearMonth = (date) => {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${year}-${month}`;
  };

  // Navigate to the previous month
  const prevMonth = () => {
    const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    debug('Navigating to previous month', newMonth);
    setCurrentMonth(newMonth);
  };

  // Navigate to the next month
  const nextMonth = () => {
    const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    debug('Navigating to next month', newMonth);
    setCurrentMonth(newMonth);
  };

  // Fetch all users
  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("authToken");
      
      if (!token) {
        return [];
      }
      
      const response = await fetch("http://localhost:5000/users", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }
      
      const data = await response.json();
      debug('Fetched users', data);
      setUsers(data);
      setFilteredUsers(data);
      return data;
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.showError("Failed to fetch users");
      return [];
    }
  };
  
  // Fetch national holidays
  const fetchNationalHolidays = async () => {
    try {
      const token = localStorage.getItem("authToken");
      
      if (!token) {
        return;
      }
      
      const year = currentMonth.getFullYear();
      
      const response = await fetch(`http://localhost:5000/national-holidays/PT/${year}`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch national holidays");
      }
      
      const holidays = await response.json();
      
      // Filter holidays for the current month
      const month = currentMonth.getMonth() + 1;
      const monthStr = String(month).padStart(2, '0');
      const currentMonthHolidays = holidays
        .filter(holiday => holiday.date.startsWith(`${year}-${monthStr}`))
        .map(holiday => ({
          date: parseInt(holiday.date.substring(8, 10), 10),
          name: holiday.name
        }));
      
      debug('National holidays for month', {
        year, 
        month: monthStr, 
        holidays: currentMonthHolidays
      });
      
      setNationalHolidays(currentMonthHolidays);
    } catch (error) {
      console.error("Error fetching national holidays:", error);
      setNationalHolidays([]);
    }
  };
  
  // Fetch all holiday requests for context (for comments and details)
  const fetchHolidayRequests = async (usersList) => {
    try {
      const token = localStorage.getItem("authToken");
      
      if (!token) return;
      
      // Since we don't have an API to fetch all requests, we'll fetch for each user
      const requests = [];
      
      // For each user or selected users
      const usersToFetch = usersList || (selectedUsers.length > 0 ? selectedUsers : users);
      debug('Fetching holiday requests for users', usersToFetch.map(u => u.username || u.email));
      
      for (const user of usersToFetch) {
        const response = await fetch(`http://localhost:5000/users/${user.userId}/holiday-requests`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const userRequests = await response.json();
          // Filter for approved requests only
          const approvedRequests = userRequests.filter(req => req.status === "approved");
          requests.push(...approvedRequests);
          debug(`Fetched holiday requests for ${user.username || user.email}`, approvedRequests);
        }
      }
      
      debug('All holiday requests', requests);
      setHolidayRequests(requests);
    } catch (error) {
      console.error("Error fetching holiday requests:", error);
    }
  };
  
  // Fetch holidays for all users for the current month
  const fetchUserHolidays = async (usersList) => {
    try {
      const token = localStorage.getItem("authToken");
      
      if (!token) {
        return;
      }
      
      const yearMonth = formatYearMonth(currentMonth);
      const holidays = {};
      
      // For each user or selected users
      const usersToFetch = usersList || (selectedUsers.length > 0 ? selectedUsers : users);
      
      debug(`Fetching holidays for ${usersToFetch.length} users in ${yearMonth}`);
      
      for (const user of usersToFetch) {
        const response = await fetch(`http://localhost:5000/users/${user.userId}/holidays/${yearMonth}`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.days && data.days.length > 0) {
            debug(`User ${user.username || user.email} holidays:`, {
              userId: user.userId,
              username: user.username || user.email,
              holidays: data.days,
              raw: data
            });
            
            holidays[user.userId] = {
              days: data.days,
              metadata: data.metadata || {},
              username: user.username || user.email.split('@')[0],
              userId: user.userId
            };
          } else {
            debug(`User ${user.username || user.email} has no holidays this month`);
          }
        }
      }
      
      debug('All holidays for this month', holidays);
      setUserHolidays(holidays);
    } catch (error) {
      console.error("Error fetching user holidays:", error);
    }
  };
  
  // Load all necessary data
  const loadData = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    
    try {
      debug('Loading data for month', {
        year: currentMonth.getFullYear(),
        month: currentMonth.getMonth() + 1
      });
      
      // Fetch all users first
      const fetchedUsers = await fetchUsers();
      
      // Fetch holidays and requests once we have users
      await Promise.all([
        fetchNationalHolidays(),
        fetchUserHolidays(fetchedUsers),
        fetchHolidayRequests(fetchedUsers)
      ]);
      
      debug('Data loading complete');
    } catch (error) {
      console.error("Error loading data:", error);
      toast.showError("Failed to load calendar data");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };
  
  // Toggle user selection
  const toggleUserSelection = (user) => {
    if (selectedUsers.some(u => u.userId === user.userId)) {
      const newSelection = selectedUsers.filter(u => u.userId !== user.userId);
      debug(`Removing user ${user.username || user.email} from selection`, newSelection);
      setSelectedUsers(newSelection);
    } else {
      const newSelection = [...selectedUsers, user];
      debug(`Adding user ${user.username || user.email} to selection`, newSelection);
      setSelectedUsers(newSelection);
    }
  };
  
  // Filter users based on search term
  const filterUsers = () => {
    if (!searchTerm.trim()) {
      setFilteredUsers(users);
      return;
    }
    
    const term = searchTerm.toLowerCase();
    const filtered = users.filter(user => {
      const username = (user.username || '').toLowerCase();
      const email = (user.email || '').toLowerCase();
      return username.includes(term) || email.includes(term);
    });
    
    setFilteredUsers(filtered);
  };
  
  // Clear all filters
  const clearFilters = () => {
    debug('Clearing filters');
    setSelectedUsers([]);
    setSearchTerm('');
    setFilteredUsers(users);
  };
  
  // Toggle filter panel
  const toggleFilter = () => {
    setShowFilter(!showFilter);
  };
  
  // Find holiday request for a specific day and user
  const findHolidayRequest = (userId, day) => {
    // Format date for comparison
    const year = currentMonth.getFullYear();
    const month = String(currentMonth.getMonth() + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${year}-${month}-${dayStr}`;
    
    debug(`Looking for holiday request for day ${day}`, { userId, dateStr });
    
    // Find matching request
    const request = holidayRequests.find(req => 
      req.userId === userId && 
      req.dates.includes(dateStr)
    );
    
    if (request) {
      debug(`Found holiday request for day ${day}`, { request });
    }
    
    return request;
  };
  
  // Check if date is weekend
  const isWeekend = (day) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const dayOfWeek = date.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6; // 0 = Sunday, 6 = Saturday
  };
  
  // Process the holiday data to identify spans and assign slots
  const processHolidaySpans = () => {
    debug('Processing holiday spans...');
    
    // Get days in the month for limits
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Initialize result
    const spans = {};
    const displayUsers = selectedUsers.length > 0 ? selectedUsers : users;
    
    // Track which slots are used for each day
    const usedSlots = Array.from({ length: daysInMonth + 1 }, () => new Set());
    
    // First, identify continuous spans in user holidays
    for (const user of displayUsers) {
      if (!userHolidays[user.userId] || !userHolidays[user.userId].days || userHolidays[user.userId].days.length === 0) {
        continue;
      }
      
      const days = [...userHolidays[user.userId].days].sort((a, b) => a - b);
      const userData = userHolidays[user.userId];
      const userSpans = [];
      
      // Find continuous spans more carefully
      let currentSpan = { start: days[0], end: days[0], days: [days[0]] };
      
      for (let i = 1; i < days.length; i++) {
        const day = days[i];
        const prevDay = days[i - 1];
        
        if (day === prevDay + 1) {
          // Continue current span
          currentSpan.end = day;
          currentSpan.days.push(day);
        } else {
          // End current span and start a new one
          userSpans.push({ ...currentSpan });
          currentSpan = { start: day, end: day, days: [day] };
        }
      }
      
      // Add the last span
      userSpans.push({ ...currentSpan });
      
      // For each span, assign a slot number that's consistent across all spans for this user
      // This ensures bars for the same user are always in the same vertical position
      let userSlotIndex = userSpans.length > 0 ? -1 : null;
      
      // Find the first slot that's available for ALL this user's spans
      let slotFound = false;
      let slotNumber = 0;
      
      while (!slotFound && slotNumber < 10) { // Limit to 10 slots
        let isSlotAvailable = true;
        
        // Try this slot with all spans for this user
        for (const span of userSpans) {
          for (let day = span.start; day <= span.end; day++) {
            if (usedSlots[day].has(slotNumber)) {
              isSlotAvailable = false;
              break;
            }
          }
          if (!isSlotAvailable) break;
        }
        
        if (isSlotAvailable) {
          userSlotIndex = slotNumber;
          slotFound = true;
          
          // Mark all days as used for this slot
          for (const span of userSpans) {
            for (let day = span.start; day <= span.end; day++) {
              usedSlots[day].add(slotNumber);
            }
          }
        } else {
          slotNumber++;
        }
      }
      
      // Fallback if no slot found
      if (userSlotIndex === -1) {
        userSlotIndex = 0; // Last resort
      }
      
      // Now assign the same slot to all spans for this user
      userSpans.forEach(span => {
        span.slot = userSlotIndex;
        span.userId = user.userId;
        span.username = userData.username;
        span.color = getUserColor(user.userId);
        
        // For each day in the span, find request details if present
        const requests = span.days.map(day => findHolidayRequest(user.userId, day)).filter(Boolean);
        const requestWithNotes = requests.find(req => 
          req.notes && req.notes !== "Requested through user dashboard"
        );
        
        span.hasComment = !!requestWithNotes;
        span.commentText = requestWithNotes ? requestWithNotes.notes : null;
      });
      
      spans[user.userId] = userSpans;
    }
    
    debug('Processed holiday spans', spans);
    setHolidaySpans(spans);
  };
  
  // Close the filter panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterRef.current && !filterRef.current.contains(event.target)) {
        setShowFilter(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // Load data on initial mount
  useEffect(() => {
    debug('Initial data load');
    loadData(true);
  }, []);
  
  // Update when month or selected users change - FIXED: Clear state and pass users to functions
  useEffect(() => {
    if (users.length > 0) {
      debug('Month or selected users changed, reloading data', {
        year: currentMonth.getFullYear(),
        month: currentMonth.getMonth() + 1,
        selectedUsers: selectedUsers.map(u => u.username || u.email)
      });
      
      // Clear previous month's data before fetching new data
      setUserHolidays({});
      setHolidayRequests([]);
      setNationalHolidays([]);
      setHolidaySpans({});
      
      // Determine which users to fetch data for
      const usersToFetch = selectedUsers.length > 0 ? selectedUsers : users;
      
      // Fetch data for the new month
      Promise.all([
        fetchNationalHolidays(),
        fetchUserHolidays(usersToFetch),
        fetchHolidayRequests(usersToFetch)
      ]).catch(error => {
        console.error("Error updating data for month change:", error);
        toast.showError("Failed to update calendar data");
      });
    }
  }, [currentMonth, selectedUsers, users]); // Added users to dependencies
  
  // Process holiday spans when user holidays or requests change
  useEffect(() => {
    if (Object.keys(userHolidays).length > 0) {
      processHolidaySpans();
    }
  }, [userHolidays, holidayRequests]);
  
  // Update filtered users when search term changes
  useEffect(() => {
    filterUsers();
  }, [searchTerm, users]);
  
  // Render the calendar
  const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    // Array of month names
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June', 
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    // Prepare the calendar grid for the current month
    const displayUsers = selectedUsers.length > 0 ? selectedUsers : users;
    
    return (
      <div className="company-calendar-container">
        <div className="calendar-header">
          <button onClick={prevMonth} className="month-nav-btn">
            <ChevronLeft size={18} />
          </button>
          <h2 className="month-title">
            {monthNames[month]} {year}
          </h2>
          <button onClick={nextMonth} className="month-nav-btn">
            <ChevronRight size={18} />
          </button>
          <button 
            className="filter-toggle-btn"
            onClick={toggleFilter}
            title="Filter Users"
          >
            <Filter size={18} />
          </button>
          
          {/* Filter panel */}
          {showFilter && (
            <div className="filter-panel" ref={filterRef}>
              <div className="filter-header">
                <h3>Filter Users</h3>
                <button 
                  className="clear-filter-btn"
                  onClick={clearFilters}
                >
                  Clear All
                </button>
              </div>
              <div className="filter-search">
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="filter-users-list">
                {filteredUsers.map(user => (
                  <div key={user.userId} className="filter-user-item">
                    <label className="filter-checkbox-label">
                      <input 
                        type="checkbox"
                        checked={selectedUsers.some(u => u.userId === user.userId)}
                        onChange={() => toggleUserSelection(user)}
                      />
                      <span className="user-info">
                        <span className="username">{user.username || user.email.split('@')[0]}</span>
                        <span className="email">{user.email}</span>
                      </span>
                    </label>
                  </div>
                ))}
                {filteredUsers.length === 0 && (
                  <div className="no-users-message">No users found</div>
                )}
              </div>
            </div>
          )}
        </div>
        
        <div className="users-legend">
          {displayUsers.map(user => (
            <div key={user.userId} className="user-legend-item">
              <div 
                className="user-color-indicator"
                style={{ backgroundColor: getUserColor(user.userId) }}
              ></div>
              <span className="user-legend-name">{user.username || user.email.split('@')[0]}</span>
            </div>
          ))}
        </div>
        
        {/* Display raw holiday data for debugging */}
        {debugMode && (
          <div className="debug-section" style={{ 
            background: '#f0f0f0', 
            padding: '10px', 
            margin: '10px 0', 
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '12px',
            fontFamily: 'monospace'
          }}>
            <h3>Debug: Holiday Spans</h3>
            <pre>
              {Object.entries(holidaySpans).map(([userId, spans]) => {
                const username = spans[0]?.username || userId;
                return `${username}: ${spans.map(span => 
                  `Span ${span.start}-${span.end} (Slot ${span.slot})`
                ).join(', ')}\n`;
              })}
            </pre>
          </div>
        )}
        
        <table className="company-calendar-table">
          <thead>
            <tr>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <th key={day}>{day}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {generateCalendarGrid()}
          </tbody>
        </table>
        
        <div className="calendar-legend">
          <div className="legend-item">
            <div className="legend-box holiday-bar"></div>
            <span>Holiday</span>
          </div>
          <div className="legend-item">
            <div className="legend-box national-holiday"></div>
            <span>National Holiday</span>
          </div>
          <div className="legend-item">
            <div className="legend-box weekend"></div>
            <span>Weekend</span>
          </div>
          <div className="legend-item">
            <div className="legend-box has-comment"></div>
            <span>Has Comment</span>
          </div>
        </div>
        
        <div className="calendar-info">
          <p><MessageSquare size={14} className="info-icon" /> Hover over a holiday with a comment icon to see details</p>
        </div>
      </div>
    );
  };
  
  // Generate calendar grid with simple and explicit logic
  const generateCalendarGrid = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    // Get first and last day of month
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    
    // Calculate days in month and first day's weekday (0 = Sunday, 6 = Saturday)
    const daysInMonth = lastDayOfMonth.getDate();
    const startWeekday = firstDayOfMonth.getDay();
    
    debug('Calendar grid parameters', {
      year, 
      month: month + 1, 
      firstDayOfMonth: firstDayOfMonth.toDateString(),
      startWeekday,
      daysInMonth
    });
    
    // Find maximum number of slots needed for any day
    const maxSlots = 10; // Cap at 10 slots
    
    // Build calendar grid
    let currentDay = 1;
    const calendarRows = [];
    
    // Calculate rows needed (max 6 rows for any month)
    const weeksNeeded = Math.ceil((startWeekday + daysInMonth) / 7);
    
    for (let weekIndex = 0; weekIndex < weeksNeeded; weekIndex++) {
      const weekRow = [];
      
      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        if ((weekIndex === 0 && dayIndex < startWeekday) || currentDay > daysInMonth) {
          // Empty cell for days outside the month
          weekRow.push(
            <td key={`empty-${weekIndex}-${dayIndex}`} className="calendar-day empty-day"></td>
          );
        } else {
          // Valid day in the month
          const dayOfMonth = currentDay;
          const isWeekendDay = (dayIndex === 0 || dayIndex === 6);
          const isNationalHoliday = nationalHolidays.some(holiday => holiday.date === dayOfMonth);
          
          let cellClass = 'calendar-day';
          if (isWeekendDay) cellClass += ' weekend-day';
          if (isNationalHoliday) cellClass += ' national-holiday';
          
          const holidayInfo = isNationalHoliday
            ? nationalHolidays.find(h => h.date === dayOfMonth)
            : null;
          
          weekRow.push(
            <td key={`day-${dayOfMonth}`} className={cellClass}>
              <div className="calendar-day-content">
                <div className="day-number">{dayOfMonth}</div>
                <div className="holiday-bars-container">
                  {renderHolidaySlotsForDay(dayOfMonth, maxSlots)}
                </div>
                {holidayInfo && (
                  <div className="national-holiday-name" title={holidayInfo.name}>
                    {holidayInfo.name}
                  </div>
                )}
              </div>
            </td>
          );
          
          currentDay++;
        }
      }
      
      calendarRows.push(<tr key={`week-${weekIndex}`}>{weekRow}</tr>);
    }
    
    return calendarRows;
  };
  
  // Get unique color for each user
  const getUserColor = (userId) => {
    // Simple hash function to convert userId to a number
    const hash = userId.split('').reduce((acc, char) => char.charCodeAt(0) + acc, 0);
    
    // List of pleasant, distinct colors
    const colors = [
      '#4285F4', // Google Blue
      '#EA4335', // Google Red
      '#FBBC05', // Google Yellow
      '#34A853', // Google Green
      '#8E44AD', // Purple
      '#F39C12', // Orange
      '#1ABC9C', // Turquoise
      '#3498DB', // Light Blue
      '#E74C3C', // Red
      '#2ECC71', // Green
      '#16A085', // Dark Teal
      '#9B59B6', // Amethyst
      '#2980B9', // Strong Blue
      '#D35400', // Pumpkin
      '#27AE60'  // Nephritis
    ];
    
    // Get a color based on the hash
    return colors[hash % colors.length];
  };
  
  
  // Render all holiday slots for a day (using fixed slots)
  const renderHolidaySlotsForDay = (day, maxSlots) => {
    // Find all spans that have this day and determine the highest slot needed
    let highestSlotNeeded = -1;
    const activeSlots = new Set();
    
    // Identify which slots are actually used on this day
    Object.values(holidaySpans).forEach(userSpans => {
      userSpans.forEach(span => {
        if (day >= span.start && day <= span.end) {
          activeSlots.add(span.slot);
          if (span.slot > highestSlotNeeded) {
            highestSlotNeeded = span.slot;
          }
        }
      });
    });
    
    // If no holidays on this day, return empty
    if (highestSlotNeeded === -1) {
      return null;
    }
    
    // Create slots array only for needed slots
    const slots = Array.from({ length: highestSlotNeeded + 1 }, (_, index) => {
      return { slotIndex: index, holiday: null, type: null };
    });
    
    // Fill in the slots based on the pre-processed spans
    Object.values(holidaySpans).forEach(userSpans => {
      userSpans.forEach(span => {
        if (day >= span.start && day <= span.end) {
          // This day is part of a holiday span
          
          // Determine span type (start, middle, end, or single)
          let type = 'single-day';
          if (span.start === span.end) {
            type = 'single-day';
          } else if (day === span.start) {
            type = 'span-start';
          } else if (day === span.end) {
            type = 'span-end';
          } else {
            type = 'span-middle';
          }
          
          // Put holiday info in the right slot
          if (span.slot <= highestSlotNeeded) {
            slots[span.slot] = {
              slotIndex: span.slot,
              holiday: span,
              type
            };
          }
        }
      });
    });
    
    // Render slots (including empty ones for proper positioning)
    return slots.map(slot => {
      if (!slot.holiday) {
        // Empty slot for spacing
        return (
          <div key={`empty-slot-${slot.slotIndex}`} className={`holiday-slot slot-${slot.slotIndex} empty`}></div>
        );
      }
      
      const holiday = slot.holiday;
      const showCommentIcon = holiday.hasComment && (slot.type === 'single-day' || slot.type === 'span-start');
 
      return (
        <div key={`slot-${slot.slotIndex}-${holiday.userId}`} className={`holiday-slot slot-${slot.slotIndex}`}>
          <div 
            className={`holiday-bar ${slot.type}`}
            style={{ backgroundColor: holiday.color }}
          >
            {showCommentIcon && (
              <CommentTooltip 
                text={holiday.commentText} 
                username={holiday.username}
              >
                <div className="comment-icon">
                  <MessageSquare size={10} strokeWidth={3} />
                </div>
              </CommentTooltip>
            )}
          </div>
        </div>
      );
    });
  };
  
  // Toggle debug mode (hidden in production)
  const toggleDebugMode = () => {
    setDebugMode(!debugMode);
  };
  
  return (
    <LoadingSpinner isLoading={loading}>
      <div className="holiday-calendar-page">
        <div className="page-header">
          <h1>Company Holiday Calendar</h1>
          <div className="page-actions">
            <button 
              className="refresh-btn"
              onClick={() => loadData(true)}
              title="Refresh"
            >
              <RefreshCw size={18}/> 
            </button>
            
            {/* Hidden debug mode toggle (only visible with query param ?debug=true) */}
            {window.location.search.includes('debug=true') && (
              <button 
                onClick={toggleDebugMode}
                style={{
                  marginLeft: '10px',
                  background: debugMode ? '#28a745' : '#6c757d',
                  color: 'white',
                  border: 'none',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                {debugMode ? 'Debug ON' : 'Debug OFF'}
              </button>
            )}
          </div>
        </div>
        
        <div className="calendar-container">
          {renderCalendar()}
        </div>
      </div>
    </LoadingSpinner>
  );
};

export default HolidayCalendar;
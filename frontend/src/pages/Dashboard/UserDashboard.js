import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useToast } from '../../components/Toast/ToastContext';
import { Upload, Pencil, Trash2, Calendar, Clock, Check, AlertTriangle, X } from 'lucide-react';

const UserDashboard = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [userStats, setUserStats] = useState({
    accountAge: 'Loading...',
    lastLogin: 'Loading...',
    isOnline: false
  });
  const [userData, setUserData] = useState(null);
  
  // Signature related states
  const [signature, setSignature] = useState(null);
  const [signatureLoading, setSignatureLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Calendar related states
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDays, setSelectedDays] = useState([]);
  const [pendingDays, setPendingDays] = useState([]);
  const [approvedDays, setApprovedDays] = useState([]);
  const [nationalHolidays, setNationalHolidays] = useState([]);
  const [isLoadingHolidays, setIsLoadingHolidays] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Holiday requests data for cancellation
  const [holidayRequests, setHolidayRequests] = useState([]);
  const [approvedHolidayRequests, setApprovedHolidayRequests] = useState([]);
  const [cancelingRequest, setCancelingRequest] = useState(null);
  
  // Holiday summary stats
  const [holidayStats, setHolidayStats] = useState({
    totalDaysAllowed: 22,
    daysUsed: 0,
    daysRequested: 0,
    daysRemaining: 22
  });

  // Format the date in DD/MM/YYYY format
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
      
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}/${month}/${year}`;
  };

  // Parse date from DD/MM/YYYY format to a Date object
  const parseDate = (dateString) => {
    const parts = dateString.split('/');
    // Note: Month is 0-indexed in JavaScript Date
    return new Date(parts[2], parts[1] - 1, parts[0]);
  };

  // Format date for API submission (YYYY-MM-DD)
  const formatDateForApi = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${year}-${month}-${day}`;
  };

  // Format the time elapsed since a timestamp
  const formatTimeElapsed = (timestamp) => {
    if (!timestamp) return "Never";
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    
    // Less than a minute
    if (diffMs < 60000) {
      return "Just now";
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
    
    // More than a day, show the date in DD/MM/YYYY format
    return formatDate(timestamp);
  };

  // Separate function to fetch user data without displaying loading state
  const fetchUserDataSilently = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const userId = localStorage.getItem("userId");
      
      if (!token || !userId) {
        // If no token or userId, redirect to login
        navigate("/login");
        return;
      }
      
      // Fetch user-specific data and statistics
      const userResponse = await fetch(`http://localhost:5000/users/${userId}`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      }).catch(() => ({ ok: false })); // Handle network errors
      
      if (userResponse.ok) {
        const userData = await userResponse.json();
        setUserData(userData);
        
        // Calculate account age
        const createdAt = new Date(userData.createdAt);
        const now = new Date();
        const diffDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
        
        // Format account age
        let accountAge;
        if (diffDays === 0) {
          accountAge = "Today";
        } else if (diffDays === 1) {
          accountAge = "1 day";
        } else if (diffDays < 30) {
          accountAge = `${diffDays} days`;
        } else if (diffDays < 365) {
          const months = Math.floor(diffDays / 30);
          accountAge = `${months} ${months === 1 ? 'month' : 'months'}`;
        } else {
          const years = Math.floor(diffDays / 365);
          const remainingMonths = Math.floor((diffDays % 365) / 30);
          if (remainingMonths === 0) {
            accountAge = `${years} ${years === 1 ? 'year' : 'years'}`;
          } else {
            accountAge = `${years} ${years === 1 ? 'year' : 'years'}, ${remainingMonths} ${remainingMonths === 1 ? 'month' : 'months'}`;
          }
        }
        
        // Format last login using lastLogin field instead of lastSeen
        // This shows the previous login timestamp, not the current one
        const lastLogin = userData.lastLogin 
          ? formatTimeElapsed(userData.lastLogin) 
          : "First login";
        
        setUserStats({
          accountAge,
          lastLogin,
          isOnline: userData.isOnline
        });
      }
      
      // Fetch signature
      await fetchSignature();
      
      // Fetch holidays data
      await fetchHolidayRequests();
      
    } catch (error) {
      console.error("Error fetching user dashboard data:", error);
      // Don't update the state on error during silent updates
      // This prevents showing error messages during background refreshes
    }
  };

  // Fetch user signature
  const fetchSignature = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const userId = localStorage.getItem("userId");
      
      if (!token || !userId) return;
      
      const response = await fetch(`http://localhost:5000/users/${userId}/signature`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.signatureUrl) {
          setSignature(data.signatureUrl);
        }
      }
    } catch (error) {
      console.error("Error fetching signature:", error);
    }
  };

  // Initial data fetch with loading state
  const initialFetchUserData = async () => {
    setLoading(true);
    
    try {
      await fetchUserDataSilently();
    } catch (error) {
      setUserStats({
        accountAge: 'Error loading',
        lastLogin: 'Error loading',
        isOnline: false
      });
    } finally {
      // Add a slight delay to ensure minimum loading time for better UX
      setTimeout(() => {
        setLoading(false);
      }, 50);
    }
  };

  // Upload signature function
  const uploadSignature = async (file) => {
    try {
      setSignatureLoading(true);
      setUploadProgress(0);
      
      const token = localStorage.getItem("authToken");
      const userId = localStorage.getItem("userId");
      
      if (!token || !userId) {
        throw new Error("Not authenticated");
      }
      
      // Create formData for file upload
      const formData = new FormData();
      formData.append('signature', file);
      
      // Set up simulated upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);
      
      // Send the file to the API
      const response = await fetch(`http://localhost:5000/users/${userId}/signature`, {
        method: 'POST',
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: formData
      });
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      if (!response.ok) {
        throw new Error("Failed to upload signature");
      }
      
      const data = await response.json();
      setSignature(data.signatureUrl);
      
      toast.showSuccess("Signature uploaded successfully");
    } catch (error) {
      toast.showError(`Error uploading signature: ${error.message}`);
    } finally {
      setSignatureLoading(false);
      setUploadProgress(0);
    }
  };

  // Handle file input change
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Check file type
    if (!file.type.includes('image/')) {
      toast.showError("Please upload an image file");
      return;
    }
    
    // Check file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.showError("File size should be less than 2MB");
      return;
    }
    
    uploadSignature(file);
  };

  // Delete signature
  const deleteSignature = async () => {
    try {
      setSignatureLoading(true);
      
      const token = localStorage.getItem("authToken");
      const userId = localStorage.getItem("userId");
      
      if (!token || !userId) {
        throw new Error("Not authenticated");
      }
      
      const response = await fetch(`http://localhost:5000/users/${userId}/signature`, {
        method: 'DELETE',
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to delete signature");
      }
      
      setSignature(null);
      toast.showSuccess("Signature deleted successfully");
    } catch (error) {
      toast.showError(`Error deleting signature: ${error.message}`);
    } finally {
      setSignatureLoading(false);
    }
  };

  // Fetch holiday requests from the server
  const fetchHolidayRequests = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const userId = localStorage.getItem("userId");
      
      if (!token || !userId) return;
      
      // For demo/testing purposes without actual backend, use mock data
      // Remove this mock section when your backend is fully implemented
      
      // Mock data for demonstration
      const mockHolidayData = [
        {
          requestId: 'holiday-12345',
          userId: userId,
          username: 'testuser',
          email: 'test@example.com',
          dates: ['15/05/2025', '16/05/2025'],
          status: 'pending',
          requestDate: new Date().toISOString()
        },
        {
          requestId: 'holiday-67890',
          userId: userId,
          username: 'testuser',
          email: 'test@example.com',
          dates: ['05/05/2025', '06/05/2025', '07/05/2025'],
          status: 'approved',
          requestDate: new Date().toISOString()
        }
      ];

      // Process holiday data from mock
      const pending = [];
      const approved = [];
      const pendingRequests = [];
      const approvedRequests = [];
      
      mockHolidayData.forEach(holiday => {
        const dates = holiday.dates.map(dateStr => parseDate(dateStr));
        
        if (holiday.status === 'pending') {
          pending.push(...dates);
          pendingRequests.push({
            requestId: holiday.requestId,
            dates: holiday.dates,
            status: 'pending'
          });
        } else if (holiday.status === 'approved') {
          approved.push(...dates);
          approvedRequests.push({
            requestId: holiday.requestId,
            dates: holiday.dates,
            status: 'approved'
          });
        }
      });
      
      setPendingDays(pending);
      setApprovedDays(approved);
      setHolidayRequests(pendingRequests);
      setApprovedHolidayRequests(approvedRequests);
      
      // Update holiday stats
      setHolidayStats(prev => ({
        ...prev,
        daysUsed: approved.length,
        daysRequested: pending.length,
        daysRemaining: prev.totalDaysAllowed - approved.length
      }));
      
      // Comment out the mock section above and uncomment this code when backend is ready
      /*
      const response = await fetch(`http://localhost:5000/users/${userId}/holidays`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch holiday requests");
      }
      
      const holidayData = await response.json();
      
      // Process holiday data
      const pending = [];
      const approved = [];
      const pendingRequests = [];
      const approvedRequests = [];
      
      holidayData.forEach(holiday => {
        const dates = holiday.dates.map(dateStr => parseDate(dateStr));
        
        if (holiday.status === "pending") {
          pending.push(...dates);
          // Store the request ID with the dates for cancellation
          pendingRequests.push({
            requestId: holiday.requestId,
            dates: holiday.dates,
            status: "pending"
          });
        } else if (holiday.status === "approved") {
          approved.push(...dates);
          // Store approved requests as well
          approvedRequests.push({
            requestId: holiday.requestId,
            dates: holiday.dates,
            status: "approved"
          });
        }
      });
      
      setPendingDays(pending);
      setApprovedDays(approved);
      setHolidayRequests(pendingRequests);
      setApprovedHolidayRequests(approvedRequests);
      
      // Update holiday stats
      setHolidayStats(prev => ({
        ...prev,
        daysUsed: approved.length,
        daysRequested: pending.length,
        daysRemaining: prev.totalDaysAllowed - approved.length
      }));
      */
      
    } catch (error) {
      console.error("Error fetching holiday requests:", error);
    }
  };

  // Fetch national holidays from the API
  const fetchNationalHolidays = async () => {
    try {
      setIsLoadingHolidays(true);
      
      // Mock national holidays for Portugal
      const mockNationalHolidays = [
        { date: `01/01/${currentMonth.getFullYear()}`, name: "New Year's Day" },
        { date: `25/04/${currentMonth.getFullYear()}`, name: "Freedom Day" },
        { date: `01/05/${currentMonth.getFullYear()}`, name: "Labor Day" },
        { date: `10/06/${currentMonth.getFullYear()}`, name: "Portugal Day" },
        { date: `15/08/${currentMonth.getFullYear()}`, name: "Assumption Day" },
        { date: `05/10/${currentMonth.getFullYear()}`, name: "Republic Day" },
        { date: `01/11/${currentMonth.getFullYear()}`, name: "All Saints' Day" },
        { date: `01/12/${currentMonth.getFullYear()}`, name: "Restoration of Independence" },
        { date: `08/12/${currentMonth.getFullYear()}`, name: "Immaculate Conception" },
        { date: `25/12/${currentMonth.getFullYear()}`, name: "Christmas Day" }
      ];
      
      // Transform the mock data to Date objects
      const holidayDates = mockNationalHolidays.map(holiday => parseDate(holiday.date));
      
      setNationalHolidays(holidayDates);
      
      // Uncomment when backend is ready
      /*
      const token = localStorage.getItem("authToken");
      
      if (!token) return;
      
      // Fetch national holidays for Portugal for the current year
      const year = currentMonth.getFullYear();
      const response = await fetch(`http://localhost:5000/holidays/national/${year}`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch national holidays");
      }
      
      const holidays = await response.json();
      
      // Transform the API response to Date objects
      const holidayDates = holidays.map(holiday => parseDate(holiday.date));
      
      setNationalHolidays(holidayDates);
      */
    } catch (error) {
      console.error("Error fetching national holidays:", error);
      toast.showError("Failed to load national holidays");
    } finally {
      setIsLoadingHolidays(false);
    }
  };

  // Cancel a holiday request
  const cancelHolidayRequest = async (requestId) => {
    try {
      setCancelingRequest(requestId);
      
      console.log(`Canceling holiday request: ${requestId}`);
      
      // For demo/testing, simulate success
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Find the request to remove
      const isApproved = approvedHolidayRequests.some(r => r.requestId === requestId);
      
      if (isApproved) {
        // Remove from approved requests
        const removedRequest = approvedHolidayRequests.find(r => r.requestId === requestId);
        setApprovedHolidayRequests(prev => prev.filter(r => r.requestId !== requestId));
        
        // Also remove the dates from approvedDays
        if (removedRequest) {
          const removedDates = removedRequest.dates.map(dateStr => parseDate(dateStr));
          setApprovedDays(prev => prev.filter(date => 
            !removedDates.some(removedDate => 
              removedDate.getDate() === date.getDate() &&
              removedDate.getMonth() === date.getMonth() &&
              removedDate.getFullYear() === date.getFullYear()
            )
          ));
        }
      } else {
        // Remove from pending requests
        const removedRequest = holidayRequests.find(r => r.requestId === requestId);
        setHolidayRequests(prev => prev.filter(r => r.requestId !== requestId));
        
        // Also remove the dates from pendingDays
        if (removedRequest) {
          const removedDates = removedRequest.dates.map(dateStr => parseDate(dateStr));
          setPendingDays(prev => prev.filter(date => 
            !removedDates.some(removedDate => 
              removedDate.getDate() === date.getDate() &&
              removedDate.getMonth() === date.getMonth() &&
              removedDate.getFullYear() === date.getFullYear()
            )
          ));
        }
      }
      
      // Update holiday stats
      setHolidayStats(prev => {
        const updatedStats = { ...prev };
        
        if (isApproved) {
          const daysRemoved = approvedHolidayRequests.find(r => r.requestId === requestId)?.dates.length || 0;
          updatedStats.daysUsed = Math.max(0, updatedStats.daysUsed - daysRemoved);
        } else {
          const daysRemoved = holidayRequests.find(r => r.requestId === requestId)?.dates.length || 0;
          updatedStats.daysRequested = Math.max(0, updatedStats.daysRequested - daysRemoved);
        }
        
        updatedStats.daysRemaining = updatedStats.totalDaysAllowed - updatedStats.daysUsed;
        return updatedStats;
      });
      
      toast.showSuccess(`Holiday request ${isApproved ? 'approved' : 'pending'} canceled successfully`);
      
      // Uncomment when backend is ready
      /*
      const token = localStorage.getItem("authToken");
      
      if (!token) {
        throw new Error("Not authenticated");
      }
      
      const response = await fetch(`http://localhost:5000/holidays/${requestId}`, {
        method: 'DELETE',
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to cancel holiday request");
      }
      
      // Refresh holiday data
      await fetchHolidayRequests();
      
      toast.showSuccess("Holiday request canceled successfully");
      */
    } catch (error) {
      console.error("Error canceling holiday request:", error);
      toast.showError("Failed to cancel holiday request");
    } finally {
      setCancelingRequest(null);
    }
  };

  // Handle day selection in the calendar
  const handleDayClick = (day) => {
    // Check if the day is a national holiday or already approved
    const isNationalHoliday = nationalHolidays.some(holiday => 
      holiday.getDate() === day.getDate() && 
      holiday.getMonth() === day.getMonth() && 
      holiday.getFullYear() === day.getFullYear()
    );
    
    const isApprovedHoliday = approvedDays.some(approvedDay => 
      approvedDay.getDate() === day.getDate() && 
      approvedDay.getMonth() === day.getMonth() && 
      approvedDay.getFullYear() === day.getFullYear()
    );
    
    const isPendingHoliday = pendingDays.some(pendingDay => 
      pendingDay.getDate() === day.getDate() && 
      pendingDay.getMonth() === day.getMonth() && 
      pendingDay.getFullYear() === day.getFullYear()
    );
    
    // Cannot select national holidays or already approved/pending days
    if (isNationalHoliday || isApprovedHoliday || isPendingHoliday) {
      return;
    }
    
    // Check if day is already selected
    const isSelected = selectedDays.some(selectedDay => 
      selectedDay.getDate() === day.getDate() && 
      selectedDay.getMonth() === day.getMonth() && 
      selectedDay.getFullYear() === day.getFullYear()
    );
    
    if (isSelected) {
      // Remove from selection
      setSelectedDays(selectedDays.filter(selectedDay => 
        !(selectedDay.getDate() === day.getDate() && 
          selectedDay.getMonth() === day.getMonth() && 
          selectedDay.getFullYear() === day.getFullYear())
      ));
    } else {
      // Add to selection
      setSelectedDays([...selectedDays, day]);
    }
  };

  // Navigate to the previous month
  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  // Navigate to the next month
  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  // Submit selected days for approval
  const submitHolidayRequest = async () => {
    if (selectedDays.length === 0) {
      toast.showInfo("Please select at least one day");
      return;
    }
    
    try {
      setSubmitting(true);
      
      // Generate a mock request ID
      const mockRequestId = `holiday-${Math.floor(Math.random() * 100000)}`;
      
      // Format selected days
      const formattedDays = selectedDays.map(day => formatDate(day));
      
      // For demo/testing purposes, simulate an API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update pending days
      setPendingDays([...pendingDays, ...selectedDays]);
      
      // Update holiday requests
      setHolidayRequests([
        ...holidayRequests, 
        {
          requestId: mockRequestId,
          dates: formattedDays,
          status: 'pending'
        }
      ]);
      
      // Update holiday stats
      setHolidayStats(prev => ({
        ...prev,
        daysRequested: prev.daysRequested + selectedDays.length
      }));
      
      // Clear selected days after submission
      setSelectedDays([]);
      
      toast.showSuccess("Holiday request submitted successfully");
      
      // Uncomment when backend is ready
      /*
      const token = localStorage.getItem("authToken");
      const userId = localStorage.getItem("userId");
      
      if (!token || !userId) {
        throw new Error("Not authenticated");
      }
      
      // Format selected days for submission
      const formattedDays = selectedDays.map(day => formatDateForApi(day));
      
      // Submit holiday request
      const response = await fetch(`http://localhost:5000/users/${userId}/holidays`, {
        method: 'POST',
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ dates: formattedDays })
      });
      
      if (!response.ok) {
        throw new Error("Failed to submit holiday request");
      }
      
      // Refresh holiday data
      await fetchHolidayRequests();
      
      // Clear selected days after submission
      setSelectedDays([]);
      
      toast.showSuccess("Holiday request submitted successfully");
      */
    } catch (error) {
      console.error("Error submitting holiday request:", error);
      toast.showError("Failed to submit holiday request");
    } finally {
      setSubmitting(false);
    }
  };

  // Component to display pending holiday requests with cancel option
  const PendingHolidaysList = ({ onCancelRequest }) => {
    if (!holidayRequests || holidayRequests.length === 0) {
      return <p className="no-pending">No pending requests</p>;
    }
    
    return (
      <ul className="pending-holidays-list">
        {holidayRequests.map((request) => (
          <li key={request.requestId} className="pending-holiday-item">
            <div className="pending-holiday-dates">
              {request.dates.length > 1 ? (
                <span>{request.dates.length} days: {request.dates[0]} - {request.dates[request.dates.length-1]}</span>
              ) : (
                <span>{request.dates[0]}</span>
              )}
            </div>
            <button 
              className="cancel-holiday-btn"
              onClick={() => onCancelRequest(request.requestId)}
              disabled={cancelingRequest === request.requestId}
              title="Cancel pending request"
            >
              {cancelingRequest === request.requestId ? <Clock size={14} /> : <X size={14} />}
            </button>
          </li>
        ))}
      </ul>
    );
  };
  
  // Component to display approved holiday requests with cancel option
  const ApprovedHolidaysList = ({ onCancelRequest }) => {
    if (!approvedHolidayRequests || approvedHolidayRequests.length === 0) {
      return <p className="no-approved">No approved holidays</p>;
    }
    
    return (
      <ul className="approved-holidays-list">
        {approvedHolidayRequests.map((request) => (
          <li key={request.requestId} className="approved-holiday-item">
            <div className="approved-holiday-dates">
              {request.dates.length > 1 ? (
                <span>{request.dates.length} days: {request.dates[0]} - {request.dates[request.dates.length-1]}</span>
              ) : (
                <span>{request.dates[0]}</span>
              )}
            </div>
            <button 
              className="cancel-holiday-btn cancel-approved"
              onClick={() => onCancelRequest(request.requestId)}
              disabled={cancelingRequest === request.requestId}
              title="Cancel approved holiday"
            >
              {cancelingRequest === request.requestId ? <Clock size={14} /> : <X size={14} />}
            </button>
          </li>
        ))}
      </ul>
    );
  };

  // Calendar rendering helper functions
  const getDaysInMonth = (month, year) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month, year) => {
    return new Date(year, month, 1).getDay();
  };

  // Get day status and CSS class
  const getDayStatus = (day) => {
    // Convert day to date object if it's not already
    const dateObj = typeof day === 'number' 
      ? new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day) 
      : day;
    
    // Check if it's a national holiday
    const isNationalHoliday = nationalHolidays.some(holiday => 
      holiday.getDate() === dateObj.getDate() && 
      holiday.getMonth() === dateObj.getMonth() && 
      holiday.getFullYear() === dateObj.getFullYear()
    );
    
    if (isNationalHoliday) {
      return 'national-holiday';
    }
    
    // Check if it's an approved holiday
    const isApproved = approvedDays.some(approvedDay => 
      approvedDay.getDate() === dateObj.getDate() && 
      approvedDay.getMonth() === dateObj.getMonth() && 
      approvedDay.getFullYear() === dateObj.getFullYear()
    );
    
    if (isApproved) {
      return 'approved-holiday';
    }
    
    // Check if it's a pending holiday
    const isPending = pendingDays.some(pendingDay => 
      pendingDay.getDate() === dateObj.getDate() && 
      pendingDay.getMonth() === dateObj.getMonth() && 
      pendingDay.getFullYear() === dateObj.getFullYear()
    );
    
    if (isPending) {
      return 'pending-approval';
    }
    
    // Check if it's a selected day
    const isSelected = selectedDays.some(selectedDay => 
      selectedDay.getDate() === dateObj.getDate() && 
      selectedDay.getMonth() === dateObj.getMonth() && 
      selectedDay.getFullYear() === dateObj.getFullYear()
    );
    
    if (isSelected) {
      return 'selected-day';
    }
    
    return '';
  };

  // Render the calendar for the current month
  const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const daysInMonth = getDaysInMonth(month, year);
    const firstDayOfMonth = getFirstDayOfMonth(month, year);
    
    // Array of day names
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    // Array of month names
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June', 
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    // Calendar grid rows
    const rows = [];
    let days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<td key={`empty-${i}`} className="empty-day"></td>);
    }
    
    // Add cells for each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayStatus = getDayStatus(date);
      
      days.push(
        <td 
          key={day} 
          className={`calendar-day ${dayStatus}`}
          onClick={() => handleDayClick(date)}
        >
          {day}
        </td>
      );
      
      // Start a new row after Saturday (6)
      if ((firstDayOfMonth + day) % 7 === 0) {
        rows.push(<tr key={day}>{days}</tr>);
        days = [];
      }
    }
    
    // Add the remaining days into the last row
    if (days.length > 0) {
      // Fill with empty cells
      while (days.length < 7) {
        days.push(<td key={`empty-end-${days.length}`} className="empty-day"></td>);
      }
      rows.push(<tr key="last-row">{days}</tr>);
    }
    
    return (
      <div className="calendar-container">
        <div className="calendar-header">
          <button onClick={prevMonth} className="month-nav-btn">❮</button>
          <h4>{monthNames[month]} {year}</h4>
          <button onClick={nextMonth} className="month-nav-btn">❯</button>
        </div>
        
        <table className="calendar-table">
          <thead>
            <tr>
              {dayNames.map(day => (
                <th key={day}>{day}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows}
          </tbody>
        </table>
        
        <div className="calendar-legend">
          <div className="legend-item">
            <div className="legend-box selected-day"></div>
            <span>Selected</span>
          </div>
          <div className="legend-item">
            <div className="legend-box pending-approval"></div>
            <span>Pending</span>
          </div>
          <div className="legend-item">
            <div className="legend-box approved-holiday"></div>
            <span>Approved</span>
          </div>
          <div className="legend-item">
            <div className="legend-box national-holiday"></div>
            <span>National</span>
          </div>
        </div>
        
        <div className="calendar-actions">
          <button 
            className="action-btn"
            onClick={submitHolidayRequest}
            disabled={selectedDays.length === 0 || submitting}
          >
            {submitting ? 'Submitting...' : 'Submit Holiday Request'}
          </button>
        </div>
      </div>
    );
  };

  useEffect(() => {
    // Initial fetch with loading state
    initialFetchUserData();
    
    // Fetch national holidays
    fetchNationalHolidays();
    
    // Set up polling to update data silently every 30 seconds
    // This won't show loading state or disrupt the user experience
    const intervalId = setInterval(() => {
      fetchUserDataSilently();
    }, 30000);
    
    // Clean up the interval on component unmount
    return () => clearInterval(intervalId);
  }, [navigate]);
  
  // Refetch national holidays when the month changes
  useEffect(() => {
    fetchNationalHolidays();
  }, [currentMonth]);

  return (
    <LoadingSpinner isLoading={loading}>
      <div className="user-dashboard">
        <div className="page-header">
          <h1>Welcome to GleeManager</h1>
          <div className="page-actions">
          </div>
        </div>
        
        <div className="dashboard-grid">
          <div className="dashboard-card welcome-card">
            <h3>Getting Started</h3>
            <p>Welcome to GleeManager! Here are some things you can do:</p>
            <ul>
              <li>View your profile and update settings</li>
              <li>Connect with other users</li>
              <li>Explore the system features</li>
            </ul>
          </div>
          
          {/* Signature Upload Card */}
          <div className="dashboard-card signature-card">
            <h3>Your Signature</h3>
            <div className="signature-container">
              {signatureLoading ? (
                <div className="signature-loading">
                  <div className="signature-spinner"></div>
                  {uploadProgress > 0 && (
                    <div className="upload-progress-container">
                      <div 
                        className="upload-progress-bar" 
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                      <span className="upload-progress-text">{uploadProgress}%</span>
                    </div>
                  )}
                </div>
              ) : signature ? (
                <div className="signature-image-container">
                  <img 
                    src={signature} 
                    alt="Your signature" 
                    className="signature-image" 
                  />
                  <div className="signature-actions">
                    <label htmlFor="update-signature" className="signature-action-btn edit-btn">
                      <Pencil size={16} />
                    </label>
                    <input
                      type="file"
                      id="update-signature"
                      accept="image/*"
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                    />
                    <button 
                      className="signature-action-btn delete-btn"
                      onClick={deleteSignature}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="signature-upload">
                  <p>Upload your signature to use in documents</p>
                  <label htmlFor="signature-upload" className="signature-upload-btn">
                    <Upload size={20} />
                    <span>Upload Signature</span>
                  </label>
                  <input
                    type="file"
                    id="signature-upload"
                    accept="image/*"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                  <p className="signature-upload-help">
                    Supported formats: JPG, PNG, GIF (max 2MB)
                  </p>
                </div>
              )}
            </div>
          </div>
          
          <div className="dashboard-card">
            <h3>Your Stats</h3>
            <div className="stats-content">
              <div className="stat-item">
                <span className="stat-label">Account Age</span>
                <span className="stat-value">{userStats.accountAge}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Last Login</span>
                <span className="stat-value">
                  {userStats.isOnline && (
                    <span className="status-indicator online"></span>
                  )}
                  {!userStats.isOnline && userStats.lastLogin !== 'Loading...' && userStats.lastLogin !== 'Error loading' && (
                    <span className="status-indicator offline"></span>
                  )}
                  {userStats.lastLogin}
                </span>
              </div>
            </div>
          </div>
          
          {/* New layout for the bottom row */}
          {/* Holiday Calendar Card - takes up 3/6 of the row */}
          <div className="dashboard-card holiday-calendar-card grid-span-3">
            <h3>Holiday Calendar</h3>
            <p className="calendar-description">Select days to request time off. Your request will be sent to an administrator for approval.</p>
            {renderCalendar()}
          </div>
          
          {/* Holiday Summary Card - takes up 1/6 of the row */}
          <div className="dashboard-card holiday-stats-card grid-span-1">
            <h3>Holiday Summary</h3>
            <div className="holiday-summary">
              <div className="holiday-summary-item">
                <Calendar size={24} className="holiday-icon" />
                <div className="holiday-summary-content">
                  <span className="holiday-summary-label">Days Allowed</span>
                  <span className="holiday-summary-value">{holidayStats.totalDaysAllowed}</span>
                </div>
              </div>
              
              <div className="holiday-summary-item">
                <Check size={24} className="holiday-icon approved" />
                <div className="holiday-summary-content">
                  <span className="holiday-summary-label">Days Used</span>
                  <span className="holiday-summary-value">{holidayStats.daysUsed}</span>
                </div>
              </div>
              
              <div className="holiday-summary-item">
                <Clock size={24} className="holiday-icon pending" />
                <div className="holiday-summary-content">
                  <span className="holiday-summary-label">Days Pending</span>
                  <span className="holiday-summary-value">{holidayStats.daysRequested}</span>
                </div>
              </div>
            </div>
            
            {pendingDays.length > 0 && (
              <div className="pending-holidays-section">
                <h4>Pending Requests</h4>
                <PendingHolidaysList onCancelRequest={cancelHolidayRequest} />
              </div>
            )}
            
            {approvedDays.length > 0 && (
              <div className="approved-holidays-section">
                <h4>Approved Holidays</h4>
                <ApprovedHolidaysList onCancelRequest={cancelHolidayRequest} />
              </div>
            )}
          </div>
          
          {/* Empty Card for future Kilometer Map - takes up 2/6 of the row */}
          <div className="dashboard-card grid-span-2">
            <h3>Kilometer Map</h3>
            <p className="coming-soon-message">This feature is coming soon. You'll be able to track and submit travel distances here.</p>
            <div className="placeholder-content">
              <div className="placeholder-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#cccccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 8V16" stroke="#cccccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 12H16" stroke="#cccccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p>Future home of the Kilometer Map feature</p>
            </div>
          </div>
        </div>
      </div>
    </LoadingSpinner>
  );
};

export default UserDashboard;
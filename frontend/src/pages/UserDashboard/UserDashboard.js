import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useToast } from '../../components/Toast/ToastContext';
import { 
  Upload, Pencil, Trash2, Calendar, Clock, Check, 
  AlertTriangle, X, Edit, Calendar as CalendarIcon,
  MessageSquare
} from 'lucide-react';
import "./UserDashboard.css";

const UserDashboard = () => {
  const navigate = useNavigate();
  const toast = useToast();
  
  // Basic states
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
  const [userHolidays, setUserHolidays] = useState([]);
  const [pendingHolidays, setPendingHolidays] = useState([]);
  const [nationalHolidays, setNationalHolidays] = useState([]);
  const [isLoadingHolidays, setIsLoadingHolidays] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Comment state for holiday requests
  const [holidayComment, setHolidayComment] = useState('');
  
  // Delete mode states
  const [deleteMode, setDeleteMode] = useState(false);
  const [daysToDelete, setDaysToDelete] = useState([]);
  const [deleting, setDeleting] = useState(false);
  
  // State for pending requests list
  const [pendingRequestsList, setPendingRequestsList] = useState([]);
  const [cancellingRequestId, setCancellingRequestId] = useState(null);
  
  // Holiday summary stats
  const [holidayStats, setHolidayStats] = useState({
    totalDaysAllowed: 22,
    daysUsed: 0,
    daysRequested: 0,
    daysRemaining: 22
  });

  // Helper function to parse date strings that may be in DD/MM/YYYY format
  const parseDate = (dateString) => {
    if (!dateString) return null;
    
    // If the date is already a Date object, return it
    if (dateString instanceof Date) return dateString;
    
    // Check if the date is in DD/MM/YYYY format
    if (typeof dateString === 'string' && dateString.includes('/')) {
      const parts = dateString.split(' ')[0].split('/');
      if (parts.length === 3) {
        // parts[0] = day, parts[1] = month, parts[2] = year
        // JavaScript Date expects month to be 0-indexed
        return new Date(parts[2], parts[1] - 1, parts[0]);
      }
    }
    
    // Otherwise, just use the default Date constructor
    return new Date(dateString);
  };

  // Format the time elapsed since a timestamp
  const formatTimeElapsed = (timestamp) => {
    if (!timestamp) return "Never";
    
    // Parse the date properly
    const date = parseDate(timestamp);
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

  // Format the date in DD/MM/YYYY format
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
      
    const date = parseDate(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}/${month}/${year}`;
  };

  // Format date and time in DD/MM/YYYY HH:MM format
  const formatDateTime = (dateString) => {
    if (!dateString) return "N/A";
      
    const date = parseDate(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  // Format date for API submission (YYYY-MM-DD)
  const formatDateForApi = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${year}-${month}-${day}`;
  };

  // Format year-month for API (YYYY-MM)
  const formatYearMonth = (date) => {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${year}-${month}`;
  };

  // Check if a date is a weekend
  const isWeekend = (date) => {
    const day = date.getDay();
    return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
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

  // Fetch user data and holidays for the current month
  const fetchUserData = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      
      const token = localStorage.getItem("authToken");
      const userId = localStorage.getItem("userId");
      
      if (!token || !userId) {
        // If no token or userId, redirect to login
        navigate("/login");
        return;
      }
      
      // Fetch user-specific data
      const userResponse = await fetch(`http://localhost:5000/users/${userId}`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      }).catch(() => ({ ok: false })); // Handle network errors
      
      if (userResponse.ok) {
        const userData = await userResponse.json();
        setUserData(userData);
        
        // Calculate account age
        const createdAt = parseDate(userData.createdAt);
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
        
        // Format last login using lastLogin field
        const lastLogin = userData.lastLogin 
          ? formatTimeElapsed(userData.lastLogin) 
          : "First login";
        
        setUserStats({
          accountAge,
          lastLogin,
          isOnline: userData.isOnline || false
        });
      } else {
        // Set error state if API call fails
        setUserStats({
          accountAge: "Error loading",
          lastLogin: "Error loading",
          isOnline: false
        });
      }
      
      // Fetch signature
      await fetchSignature();
      
      // Fetch holidays and pending requests
      await Promise.all([
        fetchUserHolidays(),
        fetchPendingRequests(),
        fetchNationalHolidays()
      ]);
      
    } catch (error) {
      console.error("Error fetching user dashboard data:", error);
      // Set error state on exception
      setUserStats({
        accountAge: "Error loading",
        lastLogin: "Error loading",
        isOnline: false
      });
    } finally {
      if (showLoading) {
        setTimeout(() => {
          setLoading(false);
        }, 50);
      }
    }
  };

  // Fetch user holidays for the current month
  const fetchUserHolidays = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const userId = localStorage.getItem("userId");
      
      if (!token || !userId) return;
      
      const yearMonth = formatYearMonth(currentMonth);
      
      console.log(`Fetching holidays for ${yearMonth}`);
      
      // Real implementation using the API
      const response = await fetch(`http://localhost:5000/users/${userId}/holidays/${yearMonth}`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log("Holidays data:", data);
        
        setUserHolidays(data.days || []);
        
        // Update holiday stats
        setHolidayStats(prev => ({
          ...prev,
          daysUsed: (data.days || []).length,
          daysRemaining: prev.totalDaysAllowed - (data.days || []).length - prev.daysRequested
        }));
      } else {
        console.log("No holidays found or error response:", response.status);
        setUserHolidays([]);
      }
    } catch (error) {
      console.error("Error fetching user holidays:", error);
      // Fallback to empty array if server call fails
      setUserHolidays([]);
    }
  };

  // Fetch pending holiday requests
  const fetchPendingRequests = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const userId = localStorage.getItem("userId");
      
      if (!token || !userId) return;
      
      console.log("Fetching pending holiday requests");
      
      // Real implementation using the API
      const response = await fetch(`http://localhost:5000/users/${userId}/holiday-requests`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log("Pending requests data:", data);
        
        // Filter to get only pending requests
        const pendingRequests = data.filter(request => request.status === "pending");
        
        // Save the full list of pending requests
        setPendingRequestsList(pendingRequests);
        
        // Extract days in the current month from pending requests
        const year = currentMonth.getFullYear();
        const month = String(currentMonth.getMonth() + 1).padStart(2, '0');
        const yearMonthPrefix = `${year}-${month}-`;
        
        const pendingDays = [];
        
        pendingRequests.forEach(request => {
          request.dates.forEach(dateStr => {
            if (dateStr.startsWith(yearMonthPrefix)) {
              const day = parseInt(dateStr.substring(8, 10), 10);
              pendingDays.push(day);
            }
          });
        });
        
        setPendingHolidays(pendingDays);
        
        // Update holiday stats
        setHolidayStats(prev => ({
          ...prev,
          daysRequested: pendingDays.length,
          daysRemaining: prev.totalDaysAllowed - prev.daysUsed - pendingDays.length
        }));
      } else {
        console.log("No pending requests found or error response:", response.status);
        setPendingHolidays([]);
        setPendingRequestsList([]);
      }
    } catch (error) {
      console.error("Error fetching pending requests:", error);
      // Fallback to empty array if server call fails
      setPendingHolidays([]);
      setPendingRequestsList([]);
    }
  };
  
  // Fetch national holidays
  const fetchNationalHolidays = async () => {
    try {
      setIsLoadingHolidays(true);
      
      const token = localStorage.getItem("authToken");
      
      if (!token) return;
      
      const year = currentMonth.getFullYear();
      
      console.log(`Fetching national holidays for ${year}`);
      
      // Real implementation using the API
      const response = await fetch(`http://localhost:5000/national-holidays/PT/${year}`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const holidays = await response.json();
        console.log("National holidays data:", holidays);
        
        // Filter holidays for the current month
        const month = currentMonth.getMonth() + 1;
        const monthStr = String(month).padStart(2, '0');
        const currentMonthHolidays = holidays
          .filter(holiday => holiday.date.startsWith(`${year}-${monthStr}`))
          .map(holiday => parseInt(holiday.date.substring(8, 10), 10));
        
        setNationalHolidays(currentMonthHolidays);
      } else {
        console.log("No national holidays found or error response:", response.status);
        setNationalHolidays([]);
      }
    } catch (error) {
      console.error("Error fetching national holidays:", error);
      
      // Fallback to most common Portuguese holidays if the API fails
      const month = currentMonth.getMonth() + 1;
      const mockHolidays = [];
      
      // Add Labor Day if the current month is May
      if (month === 5) {
        mockHolidays.push(1);
      }
      
      // Add Portugal Day if the current month is June
      if (month === 6) {
        mockHolidays.push(10);
      }
      
      // Add Christmas if the current month is December
      if (month === 12) {
        mockHolidays.push(25);
      }
      
      setNationalHolidays(mockHolidays);
    } finally {
      setIsLoadingHolidays(false);
    }
  };
  
  // Cancel a holiday request
  const cancelHolidayRequest = async (requestId) => {
    try {
      setCancellingRequestId(requestId);
      
      const token = localStorage.getItem("authToken");
      const userId = localStorage.getItem("userId");
      
      if (!token || !userId) {
        throw new Error("Not authenticated");
      }
      
      console.log("Cancelling holiday request:", requestId);
      
      const response = await fetch(`http://localhost:5000/holiday-requests/${requestId}`, {
        method: 'DELETE',
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to cancel holiday request");
      }
      
      // Refresh pending requests
      await fetchPendingRequests();
      
      toast.showSuccess("Holiday request cancelled successfully");
    } catch (error) {
      console.error("Error cancelling holiday request:", error);
      toast.showError(error.message || "Failed to cancel holiday request");
      
      // Fallback: Remove from UI if the API call fails
      setPendingRequestsList(prev => prev.filter(req => req.requestId !== requestId));
      
      // Update the calendar
      const cancelledRequest = pendingRequestsList.find(req => req.requestId === requestId);
      if (cancelledRequest) {
        // Extract days from the current month
        const year = currentMonth.getFullYear();
        const month = String(currentMonth.getMonth() + 1).padStart(2, '0');
        const yearMonthPrefix = `${year}-${month}-`;
        
        const cancelledDays = [];
        cancelledRequest.dates.forEach(dateStr => {
          if (dateStr.startsWith(yearMonthPrefix)) {
            const day = parseInt(dateStr.substring(8, 10), 10);
            cancelledDays.push(day);
          }
        });
        
        // Remove cancelled days from pending holidays
        setPendingHolidays(prev => prev.filter(day => !cancelledDays.includes(day)));
        
        // Update holiday stats
        setHolidayStats(prev => ({
          ...prev,
          daysRequested: prev.daysRequested - cancelledDays.length,
          daysRemaining: prev.totalDaysAllowed - prev.daysUsed - (prev.daysRequested - cancelledDays.length)
        }));
      }
    } finally {
      setCancellingRequestId(null);
    }
  };

  // Submit holiday request
  const submitHolidayRequest = async () => {
    if (selectedDays.length === 0) {
      toast.showInfo("Please select at least one day");
      return;
    }
    
    try {
      setSubmitting(true);
      
      const token = localStorage.getItem("authToken");
      const userId = localStorage.getItem("userId");
      
      if (!token || !userId) {
        throw new Error("Not authenticated");
      }
      
      // Format dates for submission
      const formattedDates = selectedDays.map(day => formatDateForApi(day));
      
      console.log("Submitting holiday request for dates:", formattedDates);
      
      const response = await fetch(`http://localhost:5000/holiday-requests`, {
        method: 'POST',
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ 
          dates: formattedDates,
          notes: holidayComment || "Requested through user dashboard" 
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to submit holiday request");
      }
      
      // Refresh data to show updated state
      await Promise.all([
        fetchUserHolidays(),
        fetchPendingRequests()
      ]);
      
      // Clear selected days and comment
      setSelectedDays([]);
      setHolidayComment('');
      
      toast.showSuccess("Holiday request submitted successfully");
    } catch (error) {
      console.error("Error submitting holiday request:", error);
      toast.showError(error.message || "Failed to submit holiday request");
      
      // For demo/fallback: add the days to pendingHolidays if server request fails
      const newPendingDays = selectedDays.map(date => date.getDate());
      setPendingHolidays(prev => [...prev, ...newPendingDays]);
      
      // Update holiday stats for demo
      setHolidayStats(prev => ({
        ...prev,
        daysRequested: prev.daysRequested + selectedDays.length,
        daysRemaining: prev.totalDaysAllowed - prev.daysUsed - prev.daysRequested - selectedDays.length
      }));
      
      // Clear selected days and comment
      setSelectedDays([]);
      setHolidayComment('');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete selected holidays
  const deleteSelectedHolidays = async () => {
    if (daysToDelete.length === 0) {
      toast.showInfo("Please select at least one holiday to delete");
      return;
    }
    
    try {
      setDeleting(true);
      
      const token = localStorage.getItem("authToken");
      const userId = localStorage.getItem("userId");
      
      if (!token || !userId) {
        throw new Error("Not authenticated");
      }
      
      const yearMonth = formatYearMonth(currentMonth);
      
      console.log(`Deleting holidays for ${yearMonth}:`, daysToDelete);
      
      const response = await fetch(`http://localhost:5000/users/${userId}/holidays/${yearMonth}`, {
        method: 'DELETE',
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ days: daysToDelete })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete holidays");
      }
      
      // Refresh holidays
      await fetchUserHolidays();
      
      // Clear delete mode and selected days
      setDeleteMode(false);
      setDaysToDelete([]);
      
      toast.showSuccess("Holidays deleted successfully");
    } catch (error) {
      console.error("Error deleting holidays:", error);
      toast.showError(error.message || "Failed to delete holidays");
      
      // For demo/fallback: update the UI if server request fails
      setUserHolidays(prev => prev.filter(day => !daysToDelete.includes(day)));
      
      // Update holiday stats for demo
      setHolidayStats(prev => ({
        ...prev,
        daysUsed: prev.daysUsed - daysToDelete.length,
        daysRemaining: prev.totalDaysAllowed - prev.daysUsed + daysToDelete.length - prev.daysRequested
      }));
      
      // Clear delete mode and selected days
      setDeleteMode(false);
      setDaysToDelete([]);
    } finally {
      setDeleting(false);
    }
  };

  // Toggle delete mode
  const toggleDeleteMode = () => {
    setDeleteMode(!deleteMode);
    setDaysToDelete([]);
  };

  // Handle day selection in the calendar
  const handleDayClick = (day) => {
    const dayNumber = day.getDate();
    
    // Check if day is a weekend - don't allow selection of weekends
    if (isWeekend(day)) {
      return; // Don't allow selection of weekend days
    }
    
    // In delete mode, only allow selecting approved holidays
    if (deleteMode) {
      if (userHolidays.includes(dayNumber)) {
        if (daysToDelete.includes(dayNumber)) {
          // Remove from selection
          setDaysToDelete(daysToDelete.filter(d => d !== dayNumber));
        } else {
          // Add to selection
          setDaysToDelete([...daysToDelete, dayNumber]);
        }
      }
      return;
    }
    
    // Regular selection mode for requesting holidays
    
    // Check if the day is a national holiday, already approved, or pending
    const isNationalHoliday = nationalHolidays.includes(dayNumber);
    const isHoliday = userHolidays.includes(dayNumber);
    const isPendingHoliday = pendingHolidays.includes(dayNumber);
    
    // Cannot select national holidays or already approved/pending days
    if (isNationalHoliday || isHoliday || isPendingHoliday) {
      return;
    }
    
    // Check if day is already selected
    const isSelected = selectedDays.some(selectedDay => 
      selectedDay.getDate() === dayNumber && 
      selectedDay.getMonth() === day.getMonth() && 
      selectedDay.getFullYear() === day.getFullYear()
    );
    
    if (isSelected) {
      // Remove from selection
      setSelectedDays(selectedDays.filter(selectedDay => 
        !(selectedDay.getDate() === dayNumber && 
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

  // Get day status and CSS class
  const getDayStatus = (day) => {
    // If day is a number, get the corresponding Date object
    const dayDate = typeof day === 'number' 
      ? new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day) 
      : day;
    const dayNumber = typeof day === 'number' ? day : day.getDate();
    
    // Check if it's a weekend
    if (isWeekend(dayDate)) {
      return 'user-dash-weekend-day';
    }
    
    // In delete mode, show selected days to delete differently
    if (deleteMode && daysToDelete.includes(dayNumber)) {
      return 'user-dash-delete-selected';
    }
    
    // Check if it's a national holiday
    if (nationalHolidays.includes(dayNumber)) {
      return 'user-dash-national-holiday';
    }
    
    // Check if it's an approved holiday
    if (userHolidays.includes(dayNumber)) {
      return deleteMode ? 'user-dash-holiday-deletable' : 'user-dash-approved-holiday';
    }
    
    // Check if it's a pending holiday
    if (pendingHolidays.includes(dayNumber)) {
      return 'user-dash-pending-approval';
    }
    
    // Check if it's a selected day (for new requests)
    if (!deleteMode && selectedDays.some(selectedDay => 
      selectedDay.getDate() === dayNumber && 
      selectedDay.getMonth() === currentMonth.getMonth() && 
      selectedDay.getFullYear() === currentMonth.getFullYear()
    )) {
      return 'user-dash-selected-day';
    }
    
    return '';
  };

  // Render the calendar for the current month
  const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    
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
      days.push(<td key={`empty-${i}`} className="user-dash-empty-day"></td>);
    }
    
    // Add cells for each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayStatus = getDayStatus(day);
      
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
        days.push(<td key={`empty-end-${days.length}`} className="user-dash-empty-day"></td>);
      }
      rows.push(<tr key="last-row">{days}</tr>);
    }
    
    return (
      <div className="user-dash-calendar-container">
        <div className="user-dash-calendar-header">
          <button onClick={prevMonth} className="user-dash-month-nav-btn">❮</button>
          <h4>{monthNames[month]} {year}</h4>
          <button onClick={nextMonth} className="user-dash-month-nav-btn">❯</button>
          <button 
            onClick={toggleDeleteMode} 
            className={`user-dash-delete-mode-toggle ${deleteMode ? 'active' : ''}`} 
            title={deleteMode ? "Exit Delete Mode" : "Enter Delete Mode"}
          >
            {deleteMode ? <X size={18} /> : <Edit size={18} />}
          </button>
        </div>
        
        <table className="user-dash-calendar-table">
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
        
        <div className="user-dash-calendar-legend">
          {!deleteMode ? (
            <>
              <div className="user-dash-legend-item">
                <div className="user-dash-legend-box user-dash-selected-day"></div>
                <span>Selected</span>
              </div>
              <div className="user-dash-legend-item">
                <div className="user-dash-legend-box user-dash-pending-approval"></div>
                <span>Pending</span>
              </div>
              <div className="user-dash-legend-item">
                <div className="user-dash-legend-box user-dash-approved-holiday"></div>
                <span>Approved</span>
              </div>
              <div className="user-dash-legend-item">
                <div className="user-dash-legend-box user-dash-national-holiday"></div>
                <span>National Holiday</span>
              </div>
              <div className="user-dash-legend-item">
                <div className="user-dash-legend-box user-dash-weekend-day"></div>
                <span>Weekend</span>
              </div>
            </>
          ) : (
            <>
              <div className="user-dash-legend-item">
                <div className="user-dash-legend-box user-dash-holiday-deletable"></div>
                <span>Available to Delete</span>
              </div>
              <div className="user-dash-legend-item">
                <div className="user-dash-legend-box user-dash-delete-selected"></div>
                <span>Selected for Deletion</span>
              </div>
              <div className="user-dash-legend-item">
                <div className="user-dash-legend-box user-dash-national-holiday"></div>
                <span>National Holiday</span>
              </div>
              <div className="user-dash-legend-item">
                <div className="user-dash-legend-box user-dash-weekend-day"></div>
                <span>Weekend</span>
              </div>
            </>
          )}
        </div>
        
        {/* Holiday request comment field - only shown when days are selected and not in delete mode */}
        {!deleteMode && selectedDays.length > 0 && (
          <div className="user-dash-holiday-comment-container">
            <label htmlFor="holiday-comment" className="user-dash-holiday-comment-label">
              <MessageSquare size={16} /> Add a comment (optional):
            </label>
            <textarea
              id="holiday-comment"
              className="user-dash-holiday-comment-input"
              value={holidayComment}
              onChange={(e) => setHolidayComment(e.target.value)}
              placeholder="Reason for time off or additional notes..."
              rows={3}
              maxLength={200}
            />
            <div className="user-dash-holiday-comment-count">
              {holidayComment.length}/200 characters
            </div>
          </div>
        )}
        
        <div className="user-dash-calendar-actions">
          {!deleteMode ? (
            <button 
              className="user-dash-action-btn user-dash-submit-btn"
              onClick={submitHolidayRequest}
              disabled={selectedDays.length === 0 || submitting}
            >
              {submitting ? 'Submitting...' : 'Submit Holiday Request'}
            </button>
          ) : (
            <button 
              className="user-dash-action-btn user-dash-delete-btn"
              onClick={deleteSelectedHolidays}
              disabled={daysToDelete.length === 0 || deleting}
            >
              {deleting ? 'Deleting...' : 'Delete Selected Holidays'}
            </button>
          )}
        </div>
        
        {deleteMode && (
          <p className="user-dash-delete-mode-help">
            Select approved holidays you wish to remove, then click "Delete Selected Holidays".
          </p>
        )}
      </div>
    );
  };

  useEffect(() => {
    // Initial fetch with loading state
    fetchUserData(true);
    
    // Set up polling to update data silently every 30 seconds
    const intervalId = setInterval(() => {
      fetchUserData(false);
    }, 30000);
    
    // Clean up the interval on component unmount
    return () => clearInterval(intervalId);
  }, []);
  
  // Fetch data when month changes
  useEffect(() => {
    // Reset selected days when month changes
    setSelectedDays([]);
    setDaysToDelete([]);
    
    // Fetch data for the new month
    Promise.all([
      fetchUserHolidays(),
      fetchPendingRequests(),
      fetchNationalHolidays()
    ]);
  }, [currentMonth]);

  return (
    <LoadingSpinner isLoading={loading}>
      <div className="user-dash-container">
        <div className="page-header">
          <h1>Welcome to GleeManager</h1>
          <div className="page-actions">
            <button 
              className="action-btn user-dash-view-all-holidays-btn"
              onClick={() => navigate('/holiday-calendar')}
            >
              <Calendar size={18} />
              <span>View All Holidays</span>
            </button>
          </div>
        </div>
        
        <div className="dashboard-grid user-dash-six-column-grid">
          {/* First row - 3 cards, each taking 2 columns (2+2+2=6) */}
          <div className="dashboard-card welcome-card user-dash-grid-span-2">
            <h3>Getting Started</h3>
            <p>Welcome to GleeManager! Here are some things you can do:</p>
            <ul>
              <li>View your profile and update settings</li>
              <li>Connect with other users</li>
              <li>Explore the system features</li>
            </ul>
          </div>
          
          {/* Signature Upload Card */}
          <div className="dashboard-card user-dash-signature-card user-dash-grid-span-2">
            <h3>Your Signature</h3>
            <div className="user-dash-signature-container">
              {signatureLoading ? (
                <div className="user-dash-signature-loading">
                  <div className="user-dash-signature-spinner"></div>
                  {uploadProgress > 0 && (
                    <div className="user-dash-upload-progress-container">
                      <div 
                        className="user-dash-upload-progress-bar" 
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                      <span className="user-dash-upload-progress-text">{uploadProgress}%</span>
                    </div>
                  )}
                </div>
              ) : signature ? (
                <div className="user-dash-signature-image-container">
                  <img 
                    src={signature} 
                    alt="Your signature" 
                    className="user-dash-signature-image" 
                  />
                  <div className="user-dash-signature-actions">
                    <label htmlFor="update-signature" className="user-dash-signature-action-btn edit-btn">
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
                      className="user-dash-signature-action-btn delete-btn"
                      onClick={deleteSignature}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="user-dash-signature-upload">
                  <p>Upload your signature to use in documents</p>
                  <label htmlFor="signature-upload" className="user-dash-signature-upload-btn">
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
                  <p className="user-dash-signature-upload-help">
                    Supported formats: JPG, PNG, GIF (max 2MB)
                  </p>
                </div>
              )}
            </div>
          </div>
          
          <div className="dashboard-card stats-card user-dash-grid-span-2">
            <h3>Your Stats</h3>
            <div className="user-dash-stats-content">
              <div className="user-dash-stat-item">
                <span className="user-dash-stat-label">Account Age</span>
                <span className="user-dash-stat-value">{userStats.accountAge}</span>
              </div>
              <div className="user-dash-stat-item">
                <span className="user-dash-stat-label">Last Login</span>
                <span className="user-dash-stat-value">
                  {userStats.isOnline ? (
                    <span className="user-dash-status-indicator online" title="Online"></span>
                  ) : userStats.lastLogin !== 'Loading...' && userStats.lastLogin !== 'Error loading' ? (
                    <span className="user-dash-status-indicator offline" title="Offline"></span>
                  ) : null}
                  {userStats.lastLogin}
                </span>
              </div>
            </div>
          </div>
          
          {/* Second row - Holiday Calendar (3 columns) + Holiday Summary (1 column) + Kilometer Map (2 columns) */}
          {/* Holiday Calendar Card - takes up 3/6 of the row */}
          <div className="dashboard-card holiday-calendar-card user-dash-grid-span-3">
            <h3>Holiday Calendar</h3>
            <p className="user-dash-calendar-description">
              {!deleteMode 
                ? "Select days to request time off. Your request will be sent to an administrator for approval." 
                : "You are in delete mode. Select approved holidays to remove them."}
            </p>
            {renderCalendar()}
          </div>
          
          {/* Holiday Summary Card - takes up 1/6 of the row */}
          <div className="dashboard-card holiday-stats-card user-dash-grid-span-1">
            <h3>Holiday Summary</h3>
            <div className="user-dash-holiday-summary">
              <div className="user-dash-holiday-summary-item">
                <Clock size={24} className="user-dash-holiday-icon pending" />
                <div className="user-dash-holiday-summary-content">
                  <span className="user-dash-holiday-summary-label">Days Pending</span>
                  <span className="user-dash-holiday-summary-value">{holidayStats.daysRequested}</span>
                </div>
              </div>
            </div>
            
            <div className="user-dash-pending-requests-section">
              <h4>Your Pending Requests</h4>
              {pendingRequestsList.length === 0 ? (
                <p className="user-dash-no-pending-requests-message">You have no pending holiday requests.</p>
              ) : (
                <ul className="user-dash-pending-requests-list">
                  {pendingRequestsList.map(request => (
                    <li key={request.requestId} className="user-dash-pending-request-item">
                      <div className="user-dash-request-dates">
                        <span className="user-dash-request-dates-label">Dates:</span>
                        <span className="user-dash-request-dates-value">
                          {request.dates.map(dateStr => {
                            const date = new Date(dateStr);
                            return formatDate(date);
                          }).join(', ')}
                        </span>
                      </div>
                      <div className="user-dash-request-date">
                        <span className="user-dash-request-date-label">Requested:</span>
                        <span className="request-date-value">{formatDateTime(request.requestDate)}</span>
                      </div>
                      {request.notes && request.notes !== "Requested through user dashboard" && (
                        <div className="user-dash-request-notes">
                          <span className="user-dash-request-notes-label">Notes:</span>
                          <span className="request-notes-value">{request.notes}</span>
                        </div>
                      )}
                      <button
                        className="user-dash-cancel-request-btn"
                        onClick={() => cancelHolidayRequest(request.requestId)}
                        disabled={cancellingRequestId === request.requestId}
                      >
                        {cancellingRequestId === request.requestId ? (
                          <span className="user-dash-cancel-loading">Cancelling...</span>
                        ) : (
                          <>
                            <X size={16} />
                            <span>Cancel</span>
                          </>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          
          {/* Empty Card for future Kilometer Map - takes up 2/6 of the row */}
          <div className="dashboard-card kilometer-map-card user-dash-grid-span-2">
            <h3>Kilometer Map</h3>
            <p className="user-dash-coming-soon-message">This feature is coming soon. You'll be able to track and submit travel distances here.</p>
            <div className="placeholder-content">
              <div className="user-dash-placeholder-icon">
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
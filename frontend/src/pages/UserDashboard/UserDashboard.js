// Add this to the state variables in UserDashboard.js component
const [requestComment, setRequestComment] = useState("");

// Update the calendar rendering function to include a comment field
// Add this inside the calendar-actions div, right before the submit button
<div className="comment-input-container">
  <textarea
    className="request-comment-input"
    placeholder="Add a note about your time off request (optional)"
    value={requestComment}
    onChange={(e) => setRequestComment(e.target.value)}
    maxLength={200}
  />
  <div className="comment-char-count">
    {requestComment.length}/200 characters
  </div>
</div>

// Update the submitHolidayRequest function to include the comment
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
        notes: requestComment || "Requested through user dashboard" 
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
    setRequestComment("");
    
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
    setRequestComment("");
  } finally {
    setSubmitting(false);
  }
};
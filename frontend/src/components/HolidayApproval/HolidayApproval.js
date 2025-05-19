import React, { useState, useEffect } from 'react';
import { Check, X, AlertTriangle, Calendar, User } from 'lucide-react';
import { useToast } from '../../components/Toast/ToastContext';

const HolidayApprovalPanel = () => {
  const toast = useToast();
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState([]);

  useEffect(() => {
    fetchPendingRequests();
    
    // Set up interval to refresh data every minute
    const intervalId = setInterval(() => {
      fetchPendingRequests(false);
    }, 60000);
    
    return () => clearInterval(intervalId);
  }, []);

  const fetchPendingRequests = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      
      const token = localStorage.getItem("authToken");
      
      if (!token) {
        return;
      }
      
      // Fetch pending holiday requests
      const response = await fetch("http://localhost:5000/holidays/pending", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch pending holiday requests");
      }
      
      const data = await response.json();
      setPendingRequests(data);
    } catch (error) {
      console.error("Error fetching pending holiday requests:", error);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const formatTimeElapsed = (timestamp) => {
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
    
    // Less than a week
    if (diffMs < 604800000) {
      const days = Math.floor(diffMs / 86400000);
      return `${days} ${days === 1 ? 'day' : 'days'} ago`;
    }
    
    // More than a week, show the date
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const approveRequest = async (requestId) => {
    try {
      setProcessingIds(prev => [...prev, requestId]);
      
      const token = localStorage.getItem("authToken");
      
      if (!token) {
        throw new Error("Not authenticated");
      }
      
      const response = await fetch(`http://localhost:5000/holidays/${requestId}/approve`, {
        method: 'PUT',
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to approve holiday request");
      }
      
      // Remove the approved request from the list
      setPendingRequests(prev => prev.filter(req => req.requestId !== requestId));
      
      toast.showSuccess("Holiday request approved successfully");
    } catch (error) {
      console.error("Error approving holiday request:", error);
      toast.showError("Failed to approve holiday request");
    } finally {
      setProcessingIds(prev => prev.filter(id => id !== requestId));
    }
  };

  const rejectRequest = async (requestId) => {
    try {
      setProcessingIds(prev => [...prev, requestId]);
      
      const token = localStorage.getItem("authToken");
      
      if (!token) {
        throw new Error("Not authenticated");
      }
      
      const response = await fetch(`http://localhost:5000/holidays/${requestId}/reject`, {
        method: 'PUT',
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to reject holiday request");
      }
      
      // Remove the rejected request from the list
      setPendingRequests(prev => prev.filter(req => req.requestId !== requestId));
      
      toast.showSuccess("Holiday request rejected");
    } catch (error) {
      console.error("Error rejecting holiday request:", error);
      toast.showError("Failed to reject holiday request");
    } finally {
      setProcessingIds(prev => prev.filter(id => id !== requestId));
    }
  };

  if (loading) {
    return (
      <div className="holiday-approval-loading">
        <div className="approval-spinner"></div>
        <p>Loading holiday requests...</p>
      </div>
    );
  }

  return (
    <div className="holiday-approval-panel">
      <div className="approval-header">
        <h3>Holiday Requests Awaiting Approval</h3>
        <button 
          onClick={() => fetchPendingRequests()} 
          className="refresh-btn"
          aria-label="Refresh"
        >
          ↻
        </button>
      </div>
      
      {pendingRequests.length === 0 ? (
        <div className="no-pending-requests">
          <AlertTriangle size={24} />
          <p>No pending holiday requests</p>
        </div>
      ) : (
        <div className="pending-requests-list">
          {pendingRequests.map(request => (
            <div key={request.requestId} className="holiday-request-card">
              <div className="request-header">
                <div className="requester-info">
                  <User size={20} />
                  <span className="username">{request.username}</span>
                  <span className="email">({request.email})</span>
                </div>
                <span className="request-time">{formatTimeElapsed(request.requestDate)}</span>
              </div>
              
              <div className="requested-dates">
                <Calendar size={18} />
                <div className="dates-list">
                  {request.dates.map((date, index) => (
                    <span key={index} className="date-badge">
                      {date}
                    </span>
                  ))}
                </div>
                <span className="request-days-count">
                  {request.dates.length} {request.dates.length === 1 ? 'day' : 'days'}
                </span>
              </div>
              
              <div className="request-actions">
                <button 
                  className="action-btn approve-btn"
                  onClick={() => approveRequest(request.requestId)}
                  disabled={processingIds.includes(request.requestId)}
                >
                  <Check size={18} />
                  {processingIds.includes(request.requestId) ? 'Processing...' : 'Approve'}
                </button>
                <button 
                  className="action-btn reject-btn"
                  onClick={() => rejectRequest(request.requestId)}
                  disabled={processingIds.includes(request.requestId)}
                >
                  <X size={18} />
                  {processingIds.includes(request.requestId) ? 'Processing...' : 'Reject'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HolidayApprovalPanel;
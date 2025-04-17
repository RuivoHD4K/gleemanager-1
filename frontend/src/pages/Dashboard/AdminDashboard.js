import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import UsersList from '../../components/UsersList/UsersList';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { Users, FolderKanban } from 'lucide-react';

const AdminDashboard = () => {  
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeToday: 0,
    newThisWeek: 0
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch dashboard data
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem("authToken");
        
        // Fetch user statistics
        const statsResponse = await fetch("http://localhost:5000/stats", {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        }).catch(() => ({ ok: false })); // Handle network errors
        
        // Fetch recent activity
        const activityResponse = await fetch("http://localhost:5000/activity", {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        }).catch(() => ({ ok: false })); // Handle network errors
        
        // Process stats data if available
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          setStats(statsData);
        }
        
        // Process activity data if available
        if (activityResponse.ok) {
          const activityData = await activityResponse.json();
          setRecentActivity(activityData);
        }
        
        // If the backend doesn't have these endpoints yet, use mock data
        if (!statsResponse.ok) {
          // Mock stats data
          setStats({
            totalUsers: 243,
            activeToday: 46,
            newThisWeek: 12
          });
        }
        
        /*if (!activityResponse.ok) {
          // Mock activity data
          setRecentActivity([
            "User john@example.com logged in (2 min ago)",
            "New user registered: jane@example.com (15 min ago)",
            "Password reset for bob@example.com (1 hour ago)"
          ]);
        }*/
        
        // Add slight delay to ensure minimum loading time for better UX
        setTimeout(() => {
          setLoading(false);
        }, 50);
        
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
        
        // Use mock data as fallback
        setStats({
          totalUsers: 243,
          activeToday: 46,
          newThisWeek: 12
        });
        
        setRecentActivity([
          "User john@example.com logged in (2 min ago)",
          "New user registered: jane@example.com (15 min ago)",
          "Password reset for bob@example.com (1 hour ago)"
        ]);
        
        setTimeout(() => {
          setLoading(false);
        }, 500);
      }
    };
    
    fetchDashboardData();
    
    // Set up interval to refresh dashboard data every 2 minutes
    const refreshInterval = setInterval(() => {
      fetchDashboardData();
    }, 2 * 60 * 1000);
    
    return () => clearInterval(refreshInterval);
  }, []);

  return (
    <LoadingSpinner isLoading={loading}>
      <div className="admin-dashboard">
        <div className="page-header">
          <h1>Admin Dashboard</h1>
          <div className="page-actions">
          {/*adittional buttons here*/}
          </div>
        </div>
        
        
        
        <div className="dashboard-grid">

          {/* App Drawer */}
        <div className="app-drawer">
          <div className="drawer-item" onClick={() => navigate("/user-management")}>
            <div className="drawer-icon">
              <Users size={32} />
            </div>
            <span className="drawer-label">User Management</span>
          </div>
          <div className="drawer-item" onClick={() => navigate("/project-management")}>
            <div className="drawer-icon">
              <FolderKanban size={32} />
            </div>
            <span className="drawer-label">Project Management</span>
          </div>
          
          </div>
          
          <div className="dashboard-card">
            <h3>Recent Activity</h3>
            <ul className="activity-list">
              {recentActivity.map((activity, index) => (
                <li key={index}>{activity}</li>
              ))}
            </ul>
          </div>
        </div>
        
        {/* Only show online users in the dashboard */}
        <UsersList onlyShowOnline={true} />
      </div>  
    </LoadingSpinner>
  );
};

export default AdminDashboard;
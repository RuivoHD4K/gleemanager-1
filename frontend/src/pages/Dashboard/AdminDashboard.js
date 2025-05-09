import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import UsersList from '../../components/UsersList/UsersList';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { Users, FolderKanban, FileSpreadsheet, Building2, ChevronLeft, ChevronRight, Settings, HelpCircle, Route} from 'lucide-react';

const AdminDashboard = () => {  
  const navigate = useNavigate();
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [currentDrawerPage, setCurrentDrawerPage] = useState(0);

  // Define all app drawer items
  const drawerItems = [
    {
      icon: <Users size={30} />,
      label: "User Management",
      path: "/user-management"
    },
    {
      icon: <FolderKanban size={30} />,
      label: "Project Management",
      path: "/project-management"
    },
    {
      icon: <FileSpreadsheet size={30} />,
      label: "Excel Templates",
      path: "/excel-templates"
    },
    {
      icon: <Building2 size={30} />,
      label: "Company Management",
      path: "/company-management"
    },
    {
      icon: <Route size={30} />,
      label: "Route Managemet",
      path: "/route-management"
    },
    // Add more items for pagination demo
    {
      icon: <HelpCircle size={30} />,
      label: "Example",
      path: "/"
    },
    {
      icon: <HelpCircle size={30} />,
      label: "Example",
      path: "/"
    },
  ];

  // Calculate number of pages needed for drawer items
  const itemsPerPage = 6;
  const totalPages = Math.ceil(drawerItems.length / itemsPerPage);

  // Function to handle pagination
  const changePage = (direction) => {
    if (direction === 'next' && currentDrawerPage < totalPages - 1) {
      setCurrentDrawerPage(currentDrawerPage + 1);
    } else if (direction === 'prev' && currentDrawerPage > 0) {
      setCurrentDrawerPage(currentDrawerPage - 1);
    }
  };

  // Get current drawer items based on pagination
  const getCurrentDrawerItems = () => {
    const startIndex = currentDrawerPage * itemsPerPage;
    return drawerItems.slice(startIndex, startIndex + itemsPerPage);
  };

  // Function to fetch activity data
  const fetchActivityData = async () => {
    try {
      setLoadingActivity(true);
      const token = localStorage.getItem("authToken");
      
      // Fetch recent activity
      const activityResponse = await fetch("http://localhost:5000/activity", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (activityResponse.ok) {
        const activityData = await activityResponse.json();
        setRecentActivity(activityData);
      } else {
        // If server returned an error, display a placeholder message
        setRecentActivity([
          "No recent activity to display"
        ]);
      }
    } catch (error) {
      console.error("Error fetching activity data:", error);
      setRecentActivity([
        "Unable to load activity data"
      ]);
    } finally {
      setLoadingActivity(false);
    }
  };

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
        
        // Process stats data if available
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
        }
        
        // Fetch the activity data
        await fetchActivityData();
        
        // If the backend doesn't have the stats endpoint yet, use mock data
        if (!statsResponse.ok) {
          // Mock stats data
        }
        
        // Add slight delay to ensure minimum loading time for better UX
        setTimeout(() => {
          setLoading(false);
        }, 50);
        
      } catch (error) {
        
        setRecentActivity([
          "Unable to load activity data"
        ]);
        
        setTimeout(() => {
          setLoading(false);
        }, 500);
      }
    };
    
    fetchDashboardData();
    
    // Set up interval to refresh activity data every 30 seconds
    const activityRefreshInterval = setInterval(() => {
      fetchActivityData();
    }, 30 * 1000);
    
    // Set up interval to refresh dashboard data every 2 minutes
    const dashboardRefreshInterval = setInterval(() => {
      fetchDashboardData();
    }, 2 * 60 * 1000);
    
    return () => {
      clearInterval(activityRefreshInterval);
      clearInterval(dashboardRefreshInterval);
    };
  }, []);

  return (
    <LoadingSpinner isLoading={loading}>
      <div className="admin-dashboard">
        <div className="page-header">
          <h1>Admin Dashboard</h1>
          <div className="page-actions">
            {/* additional buttons here */}
          </div>
        </div>
        
        <div className="dashboard-flex-container">
          {/* App Drawer */}
          <div className="app-drawer-container">
            <div className="app-drawer">
              {/* Previous page button - only show if there are previous pages */}
              {currentDrawerPage > 0 && (
                <button 
                  className="drawer-pagination-btn prev-btn" 
                  onClick={() => changePage('prev')}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={24} />
                </button>
              )}
              
              {/* Display current drawer items */}
              {getCurrentDrawerItems().map((item, index) => (
                <div 
                  key={index} 
                  className="drawer-item" 
                  onClick={() => navigate(item.path)}
                >
                  <div className="drawer-icon">
                    {item.icon}
                  </div>
                  <span className="drawer-label">{item.label}</span>
                </div>
              ))}
              
              {/* Next page button - only show if there are more pages */}
              {currentDrawerPage < totalPages - 1 && (
                <button 
                  className="drawer-pagination-btn next-btn" 
                  onClick={() => changePage('next')}
                  aria-label="Next page"
                >
                  <ChevronRight size={24} />
                </button>
              )}
            </div>
          </div>
          
          <div className="dashboard-card activity-card">
            <div className="activity-card-header">
              <h3 className="activity-title">Recent Activity</h3>
              {loadingActivity && (
                <div className="activity-loading-indicator">
                  <div className="activity-spinner"></div>
                </div>
              )}
            </div>
            <div className="activity-list-container">
              {recentActivity.length > 0 ? (
                <ul className="activity-list">
                  {recentActivity.map((activity, index) => (
                    <li key={index} className="activity-item">
                      <span className="activity-text">{activity}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="no-activity">
                  <p>No recent activity to display</p>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Only show online users in the dashboard */}
        <UsersList onlyShowOnline={true} />
      </div>  
    </LoadingSpinner>
  );
};

export default AdminDashboard;
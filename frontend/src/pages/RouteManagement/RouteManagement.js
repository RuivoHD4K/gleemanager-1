import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import LoadingSpinner from "../../components/LoadingSpinner/LoadingSpinner";
import { useToast } from "../../components/Toast/ToastContext";
import "./RouteManagement.css";

const RouteManagement = () => {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [formData, setFormData] = useState({
    startLocation: "",
    destination: "",
    routeLength: ""
  });
  const [showAddRouteModal, setShowAddRouteModal] = useState(false);
  const [newRouteData, setNewRouteData] = useState({
    startLocation: "",
    destination: "",
    routeLength: ""
  });
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [routeSearchTerm, setRouteSearchTerm] = useState("");
  
  // Authentication modal states
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [pendingAction, setPendingAction] = useState(null);
  
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchRoutes();
  }, []);

  // Update form data when a route is selected
  useEffect(() => {
    if (selectedRoute) {
      setFormData({
        startLocation: selectedRoute.startLocation,
        destination: selectedRoute.destination,
        routeLength: selectedRoute.routeLength
      });
    }
  }, [selectedRoute]);

  const fetchRoutes = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      
      const token = localStorage.getItem("authToken");
      const response = await fetch("http://localhost:5000/routes", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem("authToken");
          localStorage.removeItem("isAuthenticated");
          navigate("/login");
          throw new Error("Your session has expired. Please log in again.");
        }
        throw new Error("Failed to fetch routes");
      }
      
      const data = await response.json();
      
      // Update routes array
      setRoutes(data);
      
      // If a route is selected, update its data in case it changed
      if (selectedRoute) {
        const updatedSelectedRoute = data.find(route => route.routeId === selectedRoute.routeId);
        if (updatedSelectedRoute) {
          setSelectedRoute(updatedSelectedRoute);
        } else {
          // If the selected route no longer exists, select the first route
          if (data.length > 0) {
            setSelectedRoute(data[0]);
          } else {
            setSelectedRoute(null);
          }
        }
      } else if (data.length > 0 && !selectedRoute) {
        // Select first route by default if available and no route is currently selected
        setSelectedRoute(data[0]);
      }
    } catch (err) {
      if (showLoading) {
        showNotification(err.message, "error");
      } else {
        console.error("Background refresh error:", err);
      }
    } finally {
      if (showLoading) {
        // Add a slight delay to ensure minimum loading time for UX
        setTimeout(() => {
          setLoading(false);
        }, 100);
      }
    }
  };

  // Filter routes based on search term
  const filteredRoutes = routes.filter(route => {
    const searchTermLower = routeSearchTerm.toLowerCase();
    return (
      route.startLocation.toLowerCase().includes(searchTermLower) ||
      route.destination.toLowerCase().includes(searchTermLower)
    );
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleNewRouteInputChange = (e) => {
    const { name, value } = e.target;
    setNewRouteData({
      ...newRouteData,
      [name]: value
    });
  };

  const handleRouteSelect = (route) => {
    setSelectedRoute(route);
  };

  const handleCreateNewRoute = () => {
    // Reset form data
    setNewRouteData({
      startLocation: "",
      destination: "",
      routeLength: ""
    });
    
    setShowAddRouteModal(true);
  };

  const handleAddNewRoute = async (e) => {
    e.preventDefault();
    
    // Basic validation
    if (!newRouteData.startLocation || !newRouteData.destination || !newRouteData.routeLength) {
      showNotification("All fields are required", "error");
      return;
    }
    
    // Validate routeLength is a number
    if (isNaN(newRouteData.routeLength)) {
      showNotification("Route length must be a number", "error");
      return;
    }
    
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch("http://localhost:5000/routes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          startLocation: newRouteData.startLocation,
          destination: newRouteData.destination,
          routeLength: parseFloat(newRouteData.routeLength),
          createdAt: new Date().toISOString()
        })
      });
      
      if (!response.ok) {
        throw new Error("Failed to create route");
      }
      
      const result = await response.json();
      
      // Add new route to state
      const newRoute = result.route;
      
      setRoutes([...routes, newRoute]);
      
      // Select newly created route
      setSelectedRoute(newRoute);
      
      setShowAddRouteModal(false);
      showNotification(`Route from ${newRoute.startLocation} to ${newRoute.destination} created successfully!`, "success");
      
      // Refresh route list
      fetchRoutes();
    } catch (err) {
      showNotification("Failed to create route: " + err.message, "error");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedRoute) return;
    
    // Validate routeLength is a number
    if (isNaN(formData.routeLength)) {
      showNotification("Route length must be a number", "error");
      return;
    }
    
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`http://localhost:5000/routes/${selectedRoute.routeId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          routeLength: parseFloat(formData.routeLength)
        })
      });
      
      if (!response.ok) {
        throw new Error("Failed to update route");
      }
      
      // Refresh route list to show updated data
      fetchRoutes();
      
      // Show success message
      showNotification("Route updated successfully!", "success");
    } catch (err) {
      showNotification("Failed to update route: " + err.message, "error");
    }
  };

  // Initiates the delete route process with authentication
  const initiateDeleteRoute = () => {
    if (!selectedRoute) return;
    
    // Set the pending action
    setPendingAction('deleteRoute');
    // Open auth modal
    setShowAuthModal(true);
    // Reset any previous errors
    setAuthError("");
    setAdminPassword("");
  };

  // Opens the delete confirmation modal after authentication
  const showDeleteConfirmation = () => {
    setShowDeleteConfirmModal(true);
  };

  // Actual delete route function
  const handleDeleteRoute = async () => {
    if (!selectedRoute) return;
    
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`http://localhost:5000/routes/${selectedRoute.routeId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to delete route");
      }
      
      // Remove route from the state
      const updatedRoutes = routes.filter(route => route.routeId !== selectedRoute.routeId);
      setRoutes(updatedRoutes);
      
      // Select first route after deletion if available
      if (updatedRoutes.length > 0) {
        setSelectedRoute(updatedRoutes[0]);
      } else {
        setSelectedRoute(null);
      }
      
      // Close the confirmation modal
      setShowDeleteConfirmModal(false);
      
      showNotification("Route deleted successfully", "success");
    } catch (err) {
      showNotification("Failed to delete route: " + err.message, "error");
    }
  };

  // Handle authentication for sensitive actions
  const handleAuthenticate = async (e) => {
    e.preventDefault();
    
    if (!adminPassword) {
      setAuthError("Password is required");
      return;
    }
    
    try {
      const token = localStorage.getItem("authToken");
      const currentUserEmail = localStorage.getItem("userEmail");
      
      // Make authentication request
      const response = await fetch("http://localhost:5000/authenticate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          email: currentUserEmail, 
          password: adminPassword 
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.authenticated) {
        setAuthError("Invalid password");
        return;
      }
      
      // Close the auth modal
      setShowAuthModal(false);
      setAdminPassword("");
      
      // Proceed with the pending action
      if (pendingAction === 'deleteRoute') {
        showDeleteConfirmation();
      }
      
    } catch (err) {
      setAuthError("Authentication failed: " + err.message);
    }
  };

  const showNotification = (message, type = "info") => {
    if (type === "success") {
      toast.showSuccess(message);
    } else if (type === "error") {
      toast.showError(message);
    } else if (type === "warning") {
      toast.showWarning(message);
    } else {
      toast.showInfo(message);
    }
  };

  // Search Icon for search inputs
  const SearchIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="search-icon">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
  );

  return (
    <LoadingSpinner isLoading={loading}>
      <div className="route-management-container">
        <div className="page-header">
          <h1>Route Management</h1>
          <div className="page-actions">
            <button className="action-btn" onClick={handleCreateNewRoute}>
              + New Route
            </button>
          </div>
        </div>
        
        <div className="route-management-grid">
          {/* Routes list card */}
          <div className="dashboard-card routes-list-card">
            <h3>Routes</h3>
            
            {/* Search bar for routes */}
            <div className="search-container">
              <div className="search-input-wrapper">
                <SearchIcon />
                <input
                  type="text"
                  placeholder="Search routes..."
                  value={routeSearchTerm}
                  onChange={(e) => setRouteSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
            </div>
            
            <div className="routes-list-container">
              {filteredRoutes.length === 0 ? (
                routeSearchTerm ? (
                  <p className="no-results">No routes found matching "{routeSearchTerm}"</p>
                ) : (
                  <p>No routes found</p>
                )
              ) : (
                <ul className="routes-select-list">
                  {filteredRoutes.map((route) => (
                    <li 
                      key={route.routeId} 
                      onClick={() => handleRouteSelect(route)}
                      className={selectedRoute && selectedRoute.routeId === route.routeId ? "selected" : ""}
                    >
                      <div className="route-list-item">
                        <div className="route-info">
                          <span className="route-locations">{route.startLocation} to {route.destination}</span>
                          <span className="route-length">{route.routeLength} km</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          
          {/* Route edit form card */}
          <div className="dashboard-card route-edit-card">
            <h3>Edit Route</h3>
            {selectedRoute ? (
              <form onSubmit={handleSubmit} className="route-edit-form">
                <div className="form-group">
                  <label htmlFor="startLocation">Start Location</label>
                  <input
                    type="text"
                    id="startLocation"
                    name="startLocation"
                    value={formData.startLocation}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="destination">Destination</label>
                  <input
                    type="text"
                    id="destination"
                    name="destination"
                    value={formData.destination}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="routeLength">Route Length (km)</label>
                  <input
                    type="text"
                    id="routeLength"
                    name="routeLength"
                    value={formData.routeLength}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                
                <div className="form-actions">
                  <div className="action-buttons-left">
                    <button type="submit" className="action-btn save-btn">
                      Save Changes
                    </button>
                  </div>
                  <button
                    type="button"
                    className="action-btn delete-btn"
                    onClick={initiateDeleteRoute}
                  >
                    Delete Route
                  </button>
                </div>
              </form>
            ) : (
              <p>Select a route to edit</p>
            )}
          </div>
        </div>
        
        {/* Add Route Modal */}
        {showAddRouteModal && (
          <div className="modal-backdrop">
            <div className="modal-content">
              <h3>Add New Route</h3>
              <form onSubmit={handleAddNewRoute} className="route-edit-form">
                <div className="form-group">
                  <label htmlFor="new-startLocation">Start Location</label>
                  <input
                    type="text"
                    id="new-startLocation"
                    name="startLocation"
                    value={newRouteData.startLocation}
                    onChange={handleNewRouteInputChange}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="new-destination">Destination</label>
                  <input
                    type="text"
                    id="new-destination"
                    name="destination"
                    value={newRouteData.destination}
                    onChange={handleNewRouteInputChange}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="new-routeLength">Route Length (km)</label>
                  <input
                    type="text"
                    id="new-routeLength"
                    name="routeLength"
                    value={newRouteData.routeLength}
                    onChange={handleNewRouteInputChange}
                    required
                  />
                </div>
                
                <div className="form-actions">
                  <button type="submit" className="action-btn save-btn">
                    Create Route
                  </button>
                  <button 
                    type="button" 
                    className="action-btn cancel-btn"
                    onClick={() => setShowAddRouteModal(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Authentication Modal */}
        {showAuthModal && (
          <div className="modal-backdrop">
            <div className="modal-content">
              <h3>Authentication Required</h3>
              <p>
                Please enter your password to continue with this action.
              </p>
              
              <form onSubmit={handleAuthenticate} className="auth-form">
                {authError && <div className="auth-error">{authError}</div>}
                
                <div className="form-group">
                  <label htmlFor="admin-password">Your Password</label>
                  <input
                    type="password"
                    id="admin-password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    required
                  />
                </div>
                
                <div className="form-actions">
                  <button type="submit" className="action-btn save-btn">
                    Authenticate
                  </button>
                  <button 
                    type="button" 
                    className="action-btn cancel-btn"
                    onClick={() => {
                      setShowAuthModal(false);
                      setPendingAction(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirmModal && (
          <div className="modal-backdrop">
            <div className="modal-content">
              <h3>Confirm Delete Route</h3>
              <p>
                Are you sure you want to delete the route from <strong>{selectedRoute.startLocation}</strong> to <strong>{selectedRoute.destination}</strong>?
              </p>
              <p className="warning-text">
                This action cannot be undone.
              </p>
              
              <div className="form-actions">
                <button 
                  className="action-btn delete-btn"
                  onClick={handleDeleteRoute}
                >
                  Delete Route
                </button>
                <button 
                  className="action-btn cancel-btn"
                  onClick={() => setShowDeleteConfirmModal(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </LoadingSpinner>
  );
};

export default RouteManagement;
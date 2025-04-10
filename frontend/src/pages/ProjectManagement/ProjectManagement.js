import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./ProjectManagement.css";

const ProjectManagement = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [formData, setFormData] = useState({
    projectName: "",
    projectStartDate: "",
    projectEndDate: ""
  });
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [newProjectData, setNewProjectData] = useState({
    projectName: "",
    projectStartDate: "",
    projectEndDate: ""
  });

  // Delete confirmation modal state
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  
  const navigate = useNavigate();

  // Fetch projects on component mount
  useEffect(() => {
    fetchProjects();
    
    // Set up interval to refresh project data every 30 seconds
    const intervalId = setInterval(() => {
      fetchProjects(false); // Don't show loading state for background refreshes
    }, 30000);
    
    return () => clearInterval(intervalId); // Clean up on unmount
  }, []);

  // Update form data when a project is selected
  useEffect(() => {
    if (selectedProject) {
      setFormData({
        projectName: selectedProject.projectName || "",
        projectStartDate: formatDateForInput(selectedProject.projectStartDate) || "",
        projectEndDate: formatDateForInput(selectedProject.projectEndDate) || ""
      });
    }
  }, [selectedProject]);

  // Format date string for input fields (YYYY-MM-DD)
  const formatDateForInput = (dateString) => {
    if (!dateString) return "";
    
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  };

  const fetchProjects = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      
      const token = localStorage.getItem("authToken");
      
      // Simulating data fetch - replace with actual API call
      // In a real application, you would fetch from:
      // const response = await fetch("http://localhost:5000/projects", {
      //   headers: {
      //     "Authorization": `Bearer ${token}`
      //   }
      // });
      
      // Mockup data for demonstration
      const mockProjects = [
        {
          projectId: "proj-001",
          projectName: "Website Redesign",
          projectStartDate: "2023-01-15",
          projectEndDate: "2023-04-30"
        },
        {
          projectId: "proj-002",
          projectName: "Mobile App Development",
          projectStartDate: "2023-03-01",
          projectEndDate: "2023-08-15"
        },
        {
          projectId: "proj-003",
          projectName: "Database Migration",
          projectStartDate: "2023-05-10",
          projectEndDate: "2023-06-25"
        }
      ];
      
      // Update projects array
      setProjects(mockProjects);
      
      // If a project is selected, update its data in case it changed
      if (selectedProject) {
        const updatedSelectedProject = mockProjects.find(
          project => project.projectId === selectedProject.projectId
        );
        
        if (updatedSelectedProject) {
          setSelectedProject(updatedSelectedProject);
        } else {
          // If the selected project no longer exists, select the first project
          if (mockProjects.length > 0) {
            setSelectedProject(mockProjects[0]);
          } else {
            setSelectedProject(null);
          }
        }
      } else if (mockProjects.length > 0 && !selectedProject) {
        // Select first project by default if available and no project is currently selected
        setSelectedProject(mockProjects[0]);
      }
    } catch (err) {
      if (showLoading) {
        showNotification(err.message, "error");
      } else {
        console.error("Background refresh error:", err);
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleNewProjectInputChange = (e) => {
    const { name, value } = e.target;
    setNewProjectData({
      ...newProjectData,
      [name]: value
    });
  };

  const handleProjectSelect = (project) => {
    setSelectedProject(project);
  };

  const handleCreateNewProject = () => {
    // Reset form data for new project
    const today = new Date();
    const defaultEndDate = new Date();
    defaultEndDate.setMonth(today.getMonth() + 3); // Default to 3 months from now
    
    setNewProjectData({
      projectName: "",
      projectStartDate: formatDateForInput(today),
      projectEndDate: formatDateForInput(defaultEndDate)
    });
    
    setShowAddProjectModal(true);
  };

  const handleAddNewProject = async (e) => {
    e.preventDefault();
    
    // Basic validation
    if (!newProjectData.projectName || !newProjectData.projectStartDate) {
      showNotification("Project name and start date are required", "error");
      return;
    }
    
    try {
      // Generate a random project ID for demo purposes
      const projectId = "proj-" + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      
      // Create new project object
      const newProject = {
        projectId,
        ...newProjectData
      };
      
      // Add new project to state
      setProjects([...projects, newProject]);
      
      // Select newly created project
      setSelectedProject(newProject);
      
      setShowAddProjectModal(false);
      showNotification(`Project "${newProjectData.projectName}" created successfully!`, "success");
    } catch (err) {
      showNotification("Failed to create project: " + err.message, "error");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedProject) return;
    
    try {
      // Update project in the projects array
      const updatedProject = {
        ...selectedProject,
        ...formData
      };
      
      setProjects(projects.map(project => 
        project.projectId === selectedProject.projectId ? updatedProject : project
      ));
      
      // Update selected project
      setSelectedProject(updatedProject);
      
      // Show success message
      showNotification("Project updated successfully!", "success");
    } catch (err) {
      showNotification("Failed to update project: " + err.message, "error");
    }
  };

  const initiateDeleteProject = () => {
    if (!selectedProject) return;
    // Open delete confirmation modal
    setShowDeleteConfirmModal(true);
  };

  const handleDeleteProject = async () => {
    if (!selectedProject) return;
    
    try {
      // Remove project from the state
      const updatedProjects = projects.filter(project => project.projectId !== selectedProject.projectId);
      setProjects(updatedProjects);
      
      // Select first project after deletion if available
      if (updatedProjects.length > 0) {
        setSelectedProject(updatedProjects[0]);
      } else {
        setSelectedProject(null);
      }
      
      // Close the confirmation modal
      setShowDeleteConfirmModal(false);
      
      showNotification("Project deleted successfully", "success");
    } catch (err) {
      showNotification("Failed to delete project: " + err.message, "error");
    }
  };

  const showNotification = (message, type = "info") => {
    setNotification({ message, type });
    
    // Auto-clear notification after 5 seconds
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  if (loading) return <div className="loading-indicator">Loading projects...</div>;

  // Format date for display
  const formatDateForDisplay = (dateString) => {
    if (!dateString) return "Not set";
    
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  return (
    <div className="project-management-container">
      <div className="page-header">
        <h1>Project Management</h1>
        <div className="page-actions">
          <button className="action-btn" onClick={handleCreateNewProject}>
            + New Project
          </button>
        </div>
      </div>
      
      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}
      
      <div className="project-management-grid">
        {/* Projects list card */}
        <div className="dashboard-card projects-list-card">
          <h3>Projects</h3>
          <div className="projects-list-container">
            {projects.length === 0 ? (
              <p>No projects found</p>
            ) : (
              <ul className="projects-select-list">
                {projects.map((project) => (
                  <li 
                    key={project.projectId} 
                    onClick={() => handleProjectSelect(project)}
                    className={selectedProject && selectedProject.projectId === project.projectId ? "selected" : ""}
                  >
                    <div className="project-list-item">
                      <div className="project-info">
                        <span className="project-name">{project.projectName}</span>
                        <div className="project-dates">
                          <span>
                            {formatDateForDisplay(project.projectStartDate)} - {formatDateForDisplay(project.projectEndDate)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        
        {/* Project edit form card */}
        <div className="dashboard-card project-edit-card">
          <h3>Edit Project</h3>
          {selectedProject ? (
            <form onSubmit={handleSubmit} className="project-edit-form">
              <div className="form-group">
                <label htmlFor="projectName">Project Name</label>
                <input
                  type="text"
                  id="projectName"
                  name="projectName"
                  value={formData.projectName}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="projectStartDate">Start Date</label>
                <input
                  type="date"
                  id="projectStartDate"
                  name="projectStartDate"
                  value={formData.projectStartDate}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="projectEndDate">End Date</label>
                <input
                  type="date"
                  id="projectEndDate"
                  name="projectEndDate"
                  value={formData.projectEndDate}
                  onChange={handleInputChange}
                />
                <p className="form-help">Leave empty if the end date is unknown.</p>
              </div>
              
              <div className="project-details">
                <div className="project-id">Project ID: {selectedProject.projectId}</div>
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
                  onClick={initiateDeleteProject}
                >
                  Delete Project
                </button>
              </div>
            </form>
          ) : (
            <p>Select a project to edit</p>
          )}
        </div>
      </div>
      
      {/* Add Project Modal */}
      {showAddProjectModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>Add New Project</h3>
            <form onSubmit={handleAddNewProject} className="project-edit-form">
              <div className="form-group">
                <label htmlFor="new-project-name">Project Name</label>
                <input
                  type="text"
                  id="new-project-name"
                  name="projectName"
                  value={newProjectData.projectName}
                  onChange={handleNewProjectInputChange}
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="new-start-date">Start Date</label>
                <input
                  type="date"
                  id="new-start-date"
                  name="projectStartDate"
                  value={newProjectData.projectStartDate}
                  onChange={handleNewProjectInputChange}
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="new-end-date">End Date</label>
                <input
                  type="date"
                  id="new-end-date"
                  name="projectEndDate"
                  value={newProjectData.projectEndDate}
                  onChange={handleNewProjectInputChange}
                />
                <p className="form-help">Leave empty if the end date is unknown.</p>
              </div>
              
              <div className="form-actions">
                <button type="submit" className="action-btn save-btn">
                  Create Project
                </button>
                <button 
                  type="button" 
                  className="action-btn cancel-btn"
                  onClick={() => setShowAddProjectModal(false)}
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
            <h3>Confirm Delete Project</h3>
            <p>
              Are you sure you want to delete the project <strong>{selectedProject.projectName}</strong>?
            </p>
            <p className="warning-text">
              This action cannot be undone. All data associated with this project will be permanently deleted.
            </p>
            
            <div className="form-actions">
              <button 
                className="action-btn delete-btn"
                onClick={handleDeleteProject}
              >
                Delete Project
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
  );
};

export default ProjectManagement;
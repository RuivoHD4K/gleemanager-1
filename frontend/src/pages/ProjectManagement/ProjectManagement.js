import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import LoadingSpinner from "../../components/LoadingSpinner/LoadingSpinner";
import "./ProjectManagement.css";

const ProjectManagement = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [formData, setFormData] = useState({
    projectName: "",
    projectStartDate: "",
    projectEndDate: "",
    company: "",
    description: ""
  });
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [newProjectData, setNewProjectData] = useState({
    projectName: "",
    projectStartDate: "",
    projectEndDate: "",
    company: "",
    description: ""
  });

  // Character count state
  const [charCount, setCharCount] = useState({
    company: 0,
    description: 0
  });

  // Delete confirmation modal state
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  
  const navigate = useNavigate();

  // Fetch projects on component mount
  useEffect(() => {
    fetchProjects();
  }, []);

  // Update form data when a project is selected
  useEffect(() => {
    if (selectedProject) {
      setFormData({
        projectName: selectedProject.projectName || "",
        projectStartDate: selectedProject.projectStartDate || "",
        projectEndDate: selectedProject.projectEndDate || "",
        company: selectedProject.company || "",
        description: selectedProject.description || ""
      });
      
      // Update character counts
      setCharCount({
        company: (selectedProject.company || "").length,
        description: (selectedProject.description || "").length
      });
    }
  }, [selectedProject]);

  const fetchProjects = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      
      const token = localStorage.getItem("authToken");
      
      // Actual API call to fetch projects from the database
      const response = await fetch("http://localhost:5000/projects", {
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
        throw new Error("Failed to fetch projects");
      }
      
      const data = await response.json();
      
      // Update projects array
      setProjects(data);
      
      // If a project is selected, update its data in case it changed
      if (selectedProject) {
        const updatedSelectedProject = data.find(
          project => project.projectId === selectedProject.projectId
        );
        
        if (updatedSelectedProject) {
          setSelectedProject(updatedSelectedProject);
        } else {
          // If the selected project no longer exists, select the first project
          if (data.length > 0) {
            setSelectedProject(data[0]);
          } else {
            setSelectedProject(null);
          }
        }
      } else if (data.length > 0 && !selectedProject) {
        // Select first project by default if available and no project is currently selected
        setSelectedProject(data[0]);
      }
    } catch (err) {
      if (showLoading) {
        showNotification(err.message, "error");
      } else {
        console.error("Background refresh error:", err);
      }
    } finally {
      if (showLoading) {
        setTimeout(() => {
          setLoading(false);
        }, 100); // Minimum loading time for better UX
      }
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    // Update character counts for limited fields
    if (name === "company" || name === "description") {
      setCharCount(prev => ({
        ...prev,
        [name]: value.length
      }));
      
      // Prevent exceeding the max length
      if ((name === "company" && value.length > 50) || 
          (name === "description" && value.length > 500)) {
        return;
      }
    }
    
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleNewProjectInputChange = (e) => {
    const { name, value } = e.target;
    
    // Prevent exceeding the max length for new project data
    if ((name === "company" && value.length > 50) || 
        (name === "description" && value.length > 500)) {
      return;
    }
    
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
    const today = new Date().toLocaleDateString('en-GB'); // DD/MM/YYYY format
    
    setNewProjectData({
      projectName: "",
      projectStartDate: today,
      projectEndDate: "",
      company: "",
      description: ""
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
      const token = localStorage.getItem("authToken");
      
      // Create a new project in the database
      const response = await fetch("http://localhost:5000/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          projectName: newProjectData.projectName,
          projectStartDate: newProjectData.projectStartDate,
          projectEndDate: newProjectData.projectEndDate || null,
          company: newProjectData.company || "",
          description: newProjectData.description || ""
        })
      });
      
      if (!response.ok) {
        throw new Error("Failed to create project");
      }
      
      const result = await response.json();
      
      // Add new project to state
      setProjects([...projects, result.project]);
      
      // Select newly created project
      setSelectedProject(result.project);
      
      setShowAddProjectModal(false);
      showNotification(`Project "${newProjectData.projectName}" created successfully!`, "success");
      
      // Refresh project list
      fetchProjects(false);
    } catch (err) {
      showNotification("Failed to create project: " + err.message, "error");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedProject) return;
    
    try {
      const token = localStorage.getItem("authToken");
      
      // Update project in the database
      const response = await fetch(`http://localhost:5000/projects/${selectedProject.projectId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          projectName: formData.projectName,
          projectStartDate: formData.projectStartDate,
          projectEndDate: formData.projectEndDate || null,
          company: formData.company || "",
          description: formData.description || ""
        })
      });
      
      if (!response.ok) {
        throw new Error("Failed to update project");
      }
      
      // Refresh project list to show updated data
      fetchProjects(false);
      
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
      const token = localStorage.getItem("authToken");
      
      // Delete project from the database
      const response = await fetch(`http://localhost:5000/projects/${selectedProject.projectId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to delete project");
      }
      
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

   return (
    <LoadingSpinner isLoading={loading}>
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
                              {project.projectStartDate} - {project.projectEndDate || "Not set"}
                            </span>
                            {project.company && (
                              <div className="project-company">{project.company}</div>
                            )}
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
                  <label htmlFor="company">Company</label>
                  <input
                    type="text"
                    id="company"
                    name="company"
                    value={formData.company}
                    onChange={handleInputChange}

                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="projectStartDate">Start Date</label>
                  <input
                    type="text"
                    id="projectStartDate"
                    name="projectStartDate"
                    value={formData.projectStartDate}
                    onChange={handleInputChange}
                    required
                    placeholder="DD/MM/YYYY"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="projectEndDate">End Date</label>
                  <input
                    type="text"
                    id="projectEndDate"
                    name="projectEndDate"
                    value={formData.projectEndDate}
                    onChange={handleInputChange}
                    placeholder="DD/MM/YYYY"
                  />
                  <p className="form-help">Leave empty if the end date is unknown.</p>
                </div>
                
                <div className="form-group">
                  <label htmlFor="description">Project Description</label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={4}
                    maxLength={500}
                  />
                  <div className="char-counter">
                    <span className={charCount.description > 450 ? "warning" : ""}>
                      {charCount.description}/500
                    </span>
                  </div>
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
                  <label htmlFor="new-company">Company</label>
                  <input
                    type="text"
                    id="new-company"
                    name="company"
                    value={newProjectData.company}
                    onChange={handleNewProjectInputChange}
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="new-start-date">Start Date</label>
                  <input
                    type="text"
                    id="new-start-date"
                    name="projectStartDate"
                    value={newProjectData.projectStartDate}
                    onChange={handleNewProjectInputChange}
                    required
                    placeholder="DD/MM/YYYY"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="new-end-date">End Date</label>
                  <input
                    type="text"
                    id="new-end-date"
                    name="projectEndDate"
                    value={newProjectData.projectEndDate}
                    onChange={handleNewProjectInputChange}
                    placeholder="DD/MM/YYYY"
                  />
                  <p className="form-help">Leave empty if the end date is unknown.</p>
                </div>
                
                <div className="form-group">
                  <label htmlFor="new-description">Project Description</label>
                  <textarea
                    id="new-description"
                    name="description"
                    value={newProjectData.description}
                    onChange={handleNewProjectInputChange}
                    rows={4}
                    maxLength={500}
                  />
                  <div className="char-counter">
                    <span className={newProjectData.description.length > 450 ? "warning" : ""}>
                      {newProjectData.description.length}/500
                    </span>
                  </div>
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
    </LoadingSpinner>
  );
};

export default ProjectManagement;
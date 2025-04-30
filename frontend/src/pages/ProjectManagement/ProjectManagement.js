import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import LoadingSpinner from "../../components/LoadingSpinner/LoadingSpinner";
import { useToast } from "../../components/Toast/ToastContext";
import "./ProjectManagement.css";

const ProjectManagement = () => {
  const [projects, setProjects] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const toast = useToast();
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
    description: 0
  });

  // Company dropdown states
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [showNewCompanyDropdown, setShowNewCompanyDropdown] = useState(false);
  const [companySearch, setCompanySearch] = useState("");
  const [newCompanySearch, setNewCompanySearch] = useState("");
  const companyDropdownRef = useRef(null);
  const newCompanyDropdownRef = useRef(null);
  const companyBtnRef = useRef(null);
  const newCompanyBtnRef = useRef(null);

  // Delete confirmation modal state
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  
  // Search state for projects list
  const [projectSearchTerm, setProjectSearchTerm] = useState("");
  
  const navigate = useNavigate();

  // Fetch projects on component mount
  useEffect(() => {
    fetchProjects();
    fetchCompanies();
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
        description: (selectedProject.description || "").length
      });
    }
  }, [selectedProject]);

  // Handle clicking outside of company dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (companyDropdownRef.current && !companyDropdownRef.current.contains(event.target) &&
          companyBtnRef.current && !companyBtnRef.current.contains(event.target)) {
        setShowCompanyDropdown(false);
      }
      
      if (newCompanyDropdownRef.current && !newCompanyDropdownRef.current.contains(event.target) &&
          newCompanyBtnRef.current && !newCompanyBtnRef.current.contains(event.target)) {
        setShowNewCompanyDropdown(false);
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Filter projects based on search term
  const filteredProjects = projects.filter(project => {
    const searchTermLower = projectSearchTerm.toLowerCase();
    return (
      project.projectName.toLowerCase().includes(searchTermLower) ||
      (project.company && project.company.toLowerCase().includes(searchTermLower))
    );
  });

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

  const fetchCompanies = async () => {
    try {
      setLoadingCompanies(true);
      
      const token = localStorage.getItem("authToken");
      
      // Fetch companies from the database
      const response = await fetch("http://localhost:5000/companies", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch companies");
      }
      
      const data = await response.json();
      
      // Update companies array
      setCompanies(data);
    } catch (err) {
      console.error("Error fetching companies:", err);
      showNotification("Failed to load companies", "error");
    } finally {
      setLoadingCompanies(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    // Update character counts for limited fields
    if (name === "description") {
      setCharCount(prev => ({
        ...prev,
        [name]: value.length
      }));
      
      // Prevent exceeding the max length
      if (name === "description" && value.length > 500) {
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
    if (name === "description" && value.length > 500) {
      return;
    }
    
    setNewProjectData({
      ...newProjectData,
      [name]: value
    });
  };

  const handleCompanySelect = (companyName) => {
    setFormData({ ...formData, company: companyName });
    setShowCompanyDropdown(false);
    setCompanySearch("");
  };

  const handleNewCompanySelect = (companyName) => {
    setNewProjectData({ ...newProjectData, company: companyName });
    setShowNewCompanyDropdown(false);
    setNewCompanySearch("");
  };

  const handleCompanySearch = (e) => {
    setCompanySearch(e.target.value);
  };

  const handleNewCompanySearch = (e) => {
    setNewCompanySearch(e.target.value);
  };

  const toggleCompanyDropdown = () => {
    setShowCompanyDropdown(!showCompanyDropdown);
  };

  const toggleNewCompanyDropdown = () => {
    setShowNewCompanyDropdown(!showNewCompanyDropdown);
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

  // Arrow down icon component
  const ArrowDownIcon = () => (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="14" 
      height="14" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      className="dropdown-arrow-icon"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );

  // Search Icon for search inputs
  const SearchIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="search-icon">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
  );

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
        
        <div className="project-management-grid">
          {/* Projects list card */}
          <div className="dashboard-card projects-list-card">
            <h3>Projects</h3>
            
            {/* Search bar for projects */}
            <div className="search-container">
              <div className="search-input-wrapper">
                <SearchIcon />
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={projectSearchTerm}
                  onChange={(e) => setProjectSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
            </div>
            
            <div className="projects-list-container">
              {filteredProjects.length === 0 ? (
                projectSearchTerm ? (
                  <p className="no-results">No projects found matching "{projectSearchTerm}"</p>
                ) : (
                  <p>No projects found</p>
                )
              ) : (
                <ul className="projects-select-list">
                  {filteredProjects.map((project) => (
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
                  <div className="dropdown-container">
                    <button
                      type="button"
                      className="dropdown-button"
                      onClick={toggleCompanyDropdown}
                      ref={companyBtnRef}
                    >
                      <span className="dropdown-button-text">
                        {formData.company || "Select a company"}
                      </span>
                      <ArrowDownIcon />
                    </button>
                    {showCompanyDropdown && (
                      <div className="dropdown-menu" ref={companyDropdownRef}>
                        <input
                          type="text"
                          className="dropdown-search"
                          placeholder="Search companies..."
                          value={companySearch}
                          onChange={handleCompanySearch}
                          autoFocus
                        />
                        <div className="dropdown-items">
                          {loadingCompanies ? (
                            <div className="dropdown-loading">Loading...</div>
                          ) : (
                            companies
                              .filter(company => 
                                company.companyName.toLowerCase().includes(companySearch.toLowerCase())
                              )
                              .map(company => (
                                <div 
                                  key={company.companyId} 
                                  className="dropdown-item"
                                  onClick={() => handleCompanySelect(company.companyName)}
                                >
                                  {company.companyName}
                                </div>
                              ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
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
                  <div className="dropdown-container">
                    <button
                      type="button"
                      className="dropdown-button"
                      onClick={toggleNewCompanyDropdown}
                      ref={newCompanyBtnRef}
                    >
                      <span className="dropdown-button-text">
                        {newProjectData.company || "Select a company"}
                      </span>
                      <ArrowDownIcon />
                    </button>
                    {showNewCompanyDropdown && (
                      <div className="dropdown-menu" ref={newCompanyDropdownRef}>
                        <input
                          type="text"
                          className="dropdown-search"
                          placeholder="Search companies..."
                          value={newCompanySearch}
                          onChange={handleNewCompanySearch}
                          autoFocus
                        />
                        <div className="dropdown-items">
                          {loadingCompanies ? (
                            <div className="dropdown-loading">Loading...</div>
                          ) : (
                            companies
                              .filter(company => 
                                company.companyName.toLowerCase().includes(newCompanySearch.toLowerCase())
                              )
                              .map(company => (
                                <div 
                                  key={company.companyId} 
                                  className="dropdown-item"
                                  onClick={() => handleNewCompanySelect(company.companyName)}
                                >
                                  {company.companyName}
                                </div>
                              ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
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
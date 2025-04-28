import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import LoadingSpinner from "../../components/LoadingSpinner/LoadingSpinner";
import { useToast } from "../../components/Toast/ToastContext";
import "./ExcelTemplates.css";

const ExcelTemplates = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [showAddTemplateModal, setShowAddTemplateModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    description: "",
    isActive: true
  });
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [showViewTemplateModal, setShowViewTemplateModal] = useState(false);
  
  const navigate = useNavigate();

  // Fetch templates on component mount
  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      
      const response = await fetch("http://localhost:5000/excel-templates", {
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
        throw new Error("Failed to fetch templates");
      }
      
      const data = await response.json();
      setTemplates(data);
    } catch (err) {
      toast.showError("Failed to load templates: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Validate file type
      if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
        toast.showError("Please select an Excel file (.xlsx or .xls)");
        e.target.value = null;
        return;
      }
      
      // Validate file size (max 10MB)
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast.showError("File size exceeds 10MB limit");
        e.target.value = null;
        return;
      }
      
      setFile(selectedFile);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setNewTemplate({
      ...newTemplate,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!newTemplate.name.trim()) {
      toast.showError("Template name is required");
      return;
    }
    
    if (!file) {
      toast.showError("Please select an Excel file to upload");
      return;
    }
    
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      
      // Create FormData object to send file
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', newTemplate.name);
      formData.append('description', newTemplate.description || '');
      formData.append('isActive', newTemplate.isActive);
      
      // Use XMLHttpRequest for upload progress
      const xhr = new XMLHttpRequest();
      
      // Set up progress tracking
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      });
      
      // Set up completion handler
      xhr.addEventListener('load', async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          toast.showSuccess("Template uploaded successfully!");
          setShowAddTemplateModal(false);
          setFile(null);
          setNewTemplate({
            name: "",
            description: "",
            isActive: true
          });
          setUploadProgress(0);
          await fetchTemplates();
        } else {
          let errorMessage = "Failed to upload template";
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.error) {
              errorMessage = response.error;
            }
          } catch (parseErr) {
            console.error("Error parsing error response", parseErr);
          }
          toast.showError(errorMessage);
        }
        setLoading(false);
      });
      
      // Set up error handler
      xhr.addEventListener('error', () => {
        toast.showError("Network error during upload");
        setLoading(false);
      });
      
      // Open and send the request
      xhr.open('POST', 'http://localhost:5000/excel-templates');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(formData);
      
    } catch (err) {
      toast.showError("Failed to upload template: " + err.message);
      setLoading(false);
    }
  };

  const handleToggleActive = async (templateId, currentStatus) => {
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      
      const response = await fetch(`http://localhost:5000/excel-templates/${templateId}/toggle-status`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          isActive: !currentStatus
        })
      });
      
      if (!response.ok) {
        throw new Error("Failed to update template status");
      }
      
      toast.showSuccess(`Template ${currentStatus ? 'deactivated' : 'activated'} successfully`);
      
      // Update the local state
      setTemplates(templates.map(template => 
        template.templateId === templateId 
          ? { ...template, isActive: !currentStatus } 
          : template
      ));
    } catch (err) {
      toast.showError("Failed to update template status: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplate) return;
    
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      
      const response = await fetch(`http://localhost:5000/excel-templates/${selectedTemplate.templateId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to delete template");
      }
      
      toast.showSuccess("Template deleted successfully");
      
      // Remove from state
      setTemplates(templates.filter(template => template.templateId !== selectedTemplate.templateId));
      setSelectedTemplate(null);
      setShowDeleteConfirmModal(false);
    } catch (err) {
      toast.showError("Failed to delete template: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = async (templateId, templateName) => {
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      
      const response = await fetch(`http://localhost:5000/excel-templates/${templateId}/download`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to download template");
      }
      
      // Get the blob from the response
      const blob = await response.blob();
      
      // Create a temporary download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      // Ensure the filename has the right extension
      let fileName = templateName;
      if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
        fileName += '.xlsx';
      }
      a.download = fileName;
      
      // Append to the document, click, and clean up
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.showSuccess("Template downloaded successfully");
    } catch (err) {
      toast.showError("Failed to download template: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const initiateDelete = (template) => {
    setSelectedTemplate(template);
    setShowDeleteConfirmModal(true);
  };

  const viewTemplateDetails = (template) => {
    setSelectedTemplate(template);
    setShowViewTemplateModal(true);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  return (
    <LoadingSpinner isLoading={loading}>
      <div className="excel-templates-container">
        <div className="page-header">
          <h1>Excel Templates</h1>
          <div className="page-actions">
            <button 
              className="action-btn" 
              onClick={() => setShowAddTemplateModal(true)}
            >
              + Upload New Template
            </button>
          </div>
        </div>
        
        {templates.length === 0 ? (
          <div className="dashboard-card">
            <p className="no-templates-message">
              No templates found. Click "Upload New Template" to add one.
            </p>
          </div>
        ) : (
          <div className="templates-grid">
            {templates.map(template => (
              <div 
                key={template.templateId} 
                className={`template-card ${!template.isActive ? 'inactive' : ''}`}
              >
                <div className="template-header">
                  <h3>{template.name}</h3>
                  <div className="template-status">
                    {template.isActive ? (
                      <span className="status-badge active">Active</span>
                    ) : (
                      <span className="status-badge inactive">Inactive</span>
                    )}
                  </div>
                </div>
                
                {template.description && (
                  <p className="template-description">{template.description}</p>
                )}
                
                <div className="template-meta">
                  <div className="meta-item">
                    <span className="meta-label">Uploaded:</span>
                    <span className="meta-value">{formatDate(template.uploadedAt)}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Size:</span>
                    <span className="meta-value">{Math.round(template.fileSize / 1024)} KB</span>
                  </div>
                </div>
                
                <div className="template-actions">
                  <button 
                    className="template-action-btn view-btn"
                    onClick={() => viewTemplateDetails(template)}
                  >
                    Details
                  </button>
                  <button 
                    className="template-action-btn download-btn"
                    onClick={() => handleDownloadTemplate(template.templateId, template.name)}
                  >
                    Download
                  </button>
                  <button 
                    className={`template-action-btn ${template.isActive ? 'deactivate-btn' : 'activate-btn'}`}
                    onClick={() => handleToggleActive(template.templateId, template.isActive)}
                  >
                    {template.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button 
                    className="template-action-btn delete-btn"
                    onClick={() => initiateDelete(template)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* Add Template Modal */}
        {showAddTemplateModal && (
          <div className="modal-backdrop">
            <div className="modal-content">
              <h3>Upload Excel Template</h3>
              <form onSubmit={handleSubmit} className="template-form">
                <div className="form-group">
                  <label htmlFor="template-name">Template Name</label>
                  <input
                    type="text"
                    id="template-name"
                    name="name"
                    value={newTemplate.name}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="template-description">Description (Optional)</label>
                  <textarea
                    id="template-description"
                    name="description"
                    value={newTemplate.description}
                    onChange={handleInputChange}
                    rows={3}
                  />
                </div>
                
                <div className="form-group file-upload">
                  <label htmlFor="template-file">Excel File</label>
                  <input
                    type="file"
                    id="template-file"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    required
                  />
                  <p className="file-help">
                    Accepted formats: .xlsx, .xls (Max size: 10MB)
                  </p>
                </div>
                
                {uploadProgress > 0 && (
                  <div className="upload-progress">
                    <div 
                      className="progress-bar" 
                      style={{ width: `${uploadProgress}%` }}
                    >
                      {uploadProgress}%
                    </div>
                  </div>
                )}
                
                <div className="form-group checkbox-group">
                  <input
                    type="checkbox"
                    id="template-active"
                    name="isActive"
                    checked={newTemplate.isActive}
                    onChange={handleInputChange}
                  />
                  <label htmlFor="template-active">Make template active immediately</label>
                </div>
                
                <div className="form-actions">
                  <button type="submit" className="action-btn save-btn">
                    Upload Template
                  </button>
                  <button 
                    type="button" 
                    className="action-btn cancel-btn"
                    onClick={() => {
                      setShowAddTemplateModal(false);
                      setFile(null);
                      setNewTemplate({
                        name: "",
                        description: "",
                        isActive: true
                      });
                      setUploadProgress(0);
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
        {showDeleteConfirmModal && selectedTemplate && (
          <div className="modal-backdrop">
            <div className="modal-content">
              <h3>Confirm Delete Template</h3>
              <p>
                Are you sure you want to delete the template <strong>{selectedTemplate.name}</strong>?
              </p>
              <p className="warning-text">
                This action cannot be undone. The template file will be permanently deleted.
              </p>
              
              <div className="form-actions">
                <button 
                  className="action-btn delete-btn"
                  onClick={handleDeleteTemplate}
                >
                  Delete Template
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
        
        {/* View Template Details Modal */}
        {showViewTemplateModal && selectedTemplate && (
          <div className="modal-backdrop">
            <div className="modal-content">
              <h3>Template Details</h3>
              <div className="template-details">
                <div className="detail-item">
                  <span className="detail-label">Name:</span>
                  <span className="detail-value">{selectedTemplate.name}</span>
                </div>
                
                {selectedTemplate.description && (
                  <div className="detail-item">
                    <span className="detail-label">Description:</span>
                    <span className="detail-value">{selectedTemplate.description}</span>
                  </div>
                )}
                
                <div className="detail-item">
                  <span className="detail-label">Status:</span>
                  <span className="detail-value">
                    {selectedTemplate.isActive ? (
                      <span className="status-badge active">Active</span>
                    ) : (
                      <span className="status-badge inactive">Inactive</span>
                    )}
                  </span>
                </div>
                
                <div className="detail-item">
                  <span className="detail-label">File ID:</span>
                  <span className="detail-value file-id">{selectedTemplate.templateId}</span>
                </div>
                
                <div className="detail-item">
                  <span className="detail-label">Original Filename:</span>
                  <span className="detail-value">{selectedTemplate.originalFilename || "N/A"}</span>
                </div>
                
                <div className="detail-item">
                  <span className="detail-label">File Size:</span>
                  <span className="detail-value">{Math.round(selectedTemplate.fileSize / 1024)} KB</span>
                </div>
                
                <div className="detail-item">
                  <span className="detail-label">Uploaded At:</span>
                  <span className="detail-value">{formatDate(selectedTemplate.uploadedAt)}</span>
                </div>
                
                <div className="detail-item">
                  <span className="detail-label">Uploaded By:</span>
                  <span className="detail-value">{selectedTemplate.uploadedBy || "N/A"}</span>
                </div>
                
                {selectedTemplate.lastModifiedAt && (
                  <div className="detail-item">
                    <span className="detail-label">Last Modified:</span>
                    <span className="detail-value">{formatDate(selectedTemplate.lastModifiedAt)}</span>
                  </div>
                )}
              </div>
              
              <div className="form-actions">
                <button 
                  className="action-btn download-btn"
                  onClick={() => {
                    handleDownloadTemplate(selectedTemplate.templateId, selectedTemplate.name);
                    setShowViewTemplateModal(false);
                  }}
                >
                  Download Template
                </button>
                <button 
                  className="action-btn cancel-btn"
                  onClick={() => setShowViewTemplateModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </LoadingSpinner>
  );
};

export default ExcelTemplates;
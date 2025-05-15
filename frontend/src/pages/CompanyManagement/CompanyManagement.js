import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import LoadingSpinner from "../../components/LoadingSpinner/LoadingSpinner";
import { useToast } from "../../components/Toast/ToastContext";
import "./CompanyManagement.css";

const CompanyManagement = () => {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [formData, setFormData] = useState({
    companyName: "",
    nif: "",
    address: "",
    description: ""
  });
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [newCompanyData, setNewCompanyData] = useState({
    companyName: "",
    nif: "",
    address: "",
    description: ""
  });

  // Character count state
  const [charCount, setCharCount] = useState({
    description: 0
  });

  // Search state
  const [companySearchTerm, setCompanySearchTerm] = useState("");

  // Delete confirmation modal state
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  
  const navigate = useNavigate();

  // Fetch companies on component mount
  useEffect(() => {
    fetchCompanies();
  }, []);

  // Update form data when a company is selected
  useEffect(() => {
    if (selectedCompany) {
      setFormData({
        companyName: selectedCompany.companyName || "",
        nif: selectedCompany.nif || "",
        address: selectedCompany.address || "",
        description: selectedCompany.description || ""
      });
      
      // Update character counts
      setCharCount({
        description: (selectedCompany.description || "").length
      });
    }
  }, [selectedCompany]);

  // Filter companies based on search term
  const filteredCompanies = companies.filter(company => {
    const searchTermLower = companySearchTerm.toLowerCase();
    return (
      company.companyName.toLowerCase().includes(searchTermLower) ||
      company.nif.toLowerCase().includes(searchTermLower) ||
      (company.address && company.address.toLowerCase().includes(searchTermLower))
    );
  });

  const fetchCompanies = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      
      const token = localStorage.getItem("authToken");
      
      // Fetch companies from the database
      const response = await fetch("http://localhost:5000/companies", {
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
        throw new Error("Failed to fetch companies");
      }
      
      const data = await response.json();
      
      // Update companies array
      setCompanies(data);
      
      // If a company is selected, update its data in case it changed
      if (selectedCompany) {
        const updatedSelectedCompany = data.find(
          company => company.companyId === selectedCompany.companyId
        );
        
        if (updatedSelectedCompany) {
          setSelectedCompany(updatedSelectedCompany);
        } else {
          // If the selected company no longer exists, select the first company
          if (data.length > 0) {
            setSelectedCompany(data[0]);
          } else {
            setSelectedCompany(null);
          }
        }
      } else if (data.length > 0 && !selectedCompany) {
        // Select first company by default if available and no company is currently selected
        setSelectedCompany(data[0]);
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

  const handleNewCompanyInputChange = (e) => {
    const { name, value } = e.target;
    
    // Prevent exceeding the max length for new company data
    if (name === "description" && value.length > 500) {
      return;
    }
    
    setNewCompanyData({
      ...newCompanyData,
      [name]: value
    });
  };

  const handleCompanySelect = (company) => {
    setSelectedCompany(company);
  };

  const handleCreateNewCompany = () => {
    // Reset form data for new company
    setNewCompanyData({
      companyName: "",
      nif: "",
      address: "",
      description: ""
    });
    
    setShowAddCompanyModal(true);
  };

  const handleAddNewCompany = async (e) => {
    e.preventDefault();
    
    // Basic validation
    if (!newCompanyData.companyName || !newCompanyData.nif) {
      showNotification("Company name and NIF are required", "error");
      return;
    }
    
    try {
      const token = localStorage.getItem("authToken");
      
      // Create a new company in the database
      const response = await fetch("http://localhost:5000/companies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          companyName: newCompanyData.companyName,
          nif: newCompanyData.nif,
          address: newCompanyData.address || "",
          description: newCompanyData.description || ""
        })
      });
      
      if (!response.ok) {
        throw new Error("Failed to create company");
      }
      
      const result = await response.json();
      
      // Add new company to state
      setCompanies([...companies, result.company]);
      
      // Select newly created company
      setSelectedCompany(result.company);
      
      setShowAddCompanyModal(false);
      showNotification(`Company "${newCompanyData.companyName}" created successfully!`, "success");
      
      // Refresh company list
      fetchCompanies(false);
    } catch (err) {
      showNotification("Failed to create company: " + err.message, "error");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedCompany) return;
    
    try {
      const token = localStorage.getItem("authToken");
      
      // Update company in the database
      const response = await fetch(`http://localhost:5000/companies/${selectedCompany.companyId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          companyName: formData.companyName,
          nif: formData.nif,
          address: formData.address || "",
          description: formData.description || ""
        })
      });
      
      if (!response.ok) {
        throw new Error("Failed to update company");
      }
      
      // Refresh company list to show updated data
      fetchCompanies(false);
      
      // Show success message
      showNotification("Company updated successfully!", "success");
    } catch (err) {
      showNotification("Failed to update company: " + err.message, "error");
    }
  };

  const initiateDeleteCompany = () => {
    if (!selectedCompany) return;
    // Open delete confirmation modal
    setShowDeleteConfirmModal(true);
  };

  const handleDeleteCompany = async () => {
    if (!selectedCompany) return;
    
    try {
      const token = localStorage.getItem("authToken");
      
      // Delete company from the database
      const response = await fetch(`http://localhost:5000/companies/${selectedCompany.companyId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to delete company");
      }
      
      // Remove company from the state
      const updatedCompanies = companies.filter(company => company.companyId !== selectedCompany.companyId);
      setCompanies(updatedCompanies);
      
      // Select first company after deletion if available
      if (updatedCompanies.length > 0) {
        setSelectedCompany(updatedCompanies[0]);
      } else {
        setSelectedCompany(null);
      }
      
      // Close the confirmation modal
      setShowDeleteConfirmModal(false);
      
      showNotification("Company deleted successfully", "success");
    } catch (err) {
      showNotification("Failed to delete company: " + err.message, "error");
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
      <div className="company-management-container">
        <div className="page-header">
          <h1>Company Management</h1>
          <div className="page-actions">
            <button className="action-btn" onClick={handleCreateNewCompany}>
              + New Company
            </button>
          </div>
        </div>
        
        <div className="company-management-grid">
          {/* Companies list card */}
          <div className="dashboard-card companies-list-card">
            <h3>Companies</h3>
            
            {/* Search bar for companies */}
            <div className="search-container">
              <div className="search-input-wrapper">
                <SearchIcon />
                <input
                  type="text"
                  placeholder="Search companies..."
                  value={companySearchTerm}
                  onChange={(e) => setCompanySearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
            </div>
            
            <div className="companies-list-container">
              {filteredCompanies.length === 0 ? (
                companySearchTerm ? (
                  <p className="no-results">No companies found matching "{companySearchTerm}"</p>
                ) : (
                  <p>No companies found</p>
                )
              ) : (
                <ul className="companies-select-list">
                  {filteredCompanies.map((company) => (
                    <li 
                      key={company.companyId} 
                      onClick={() => handleCompanySelect(company)}
                      className={selectedCompany && selectedCompany.companyId === company.companyId ? "selected" : ""}
                    >
                      <div className="company-list-item">
                        <div className="company-info">
                          <span className="company-name">{company.companyName}</span>
                          <span className="company-nif">NIF: {company.nif}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          
          {/* Company edit form card */}
          <div className="dashboard-card company-edit-card">
            <h3>Edit Company</h3>
            {selectedCompany ? (
              <form onSubmit={handleSubmit} className="company-edit-form">
                <div className="form-group">
                  <label htmlFor="companyName">Company Name</label>
                  <input
                    type="text"
                    id="companyName"
                    name="companyName"
                    value={formData.companyName}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="nif">NIF (Tax ID)</label>
                  <input
                    type="text"
                    id="nif"
                    name="nif"
                    value={formData.nif}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="address">Address</label>
                  <input
                    type="text"
                    id="address"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="description">Company Description</label>
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
                
                <div className="company-details">
                  <div className="company-id">Company ID: {selectedCompany.companyId}</div>
                  <div className="company-created">Created: {selectedCompany.createdAt}</div>
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
                    onClick={initiateDeleteCompany}
                  >
                    Delete Company
                  </button>
                </div>
              </form>
            ) : (
              <p>Select a company to edit</p>
            )}
          </div>
        </div>
        
        {/* Add Company Modal */}
        {showAddCompanyModal && (
          <div className="modal-backdrop">
            <div className="modal-content">
              <h3>Add New Company</h3>
              <form onSubmit={handleAddNewCompany} className="company-edit-form">
                <div className="form-group">
                  <label htmlFor="new-company-name">Company Name</label>
                  <input
                    type="text"
                    id="new-company-name"
                    name="companyName"
                    value={newCompanyData.companyName}
                    onChange={handleNewCompanyInputChange}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="new-nif">NIF (Tax ID)</label>
                  <input
                    type="text"
                    id="new-nif"
                    name="nif"
                    value={newCompanyData.nif}
                    onChange={handleNewCompanyInputChange}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="new-address">Address</label>
                  <input
                    type="text"
                    id="new-address"
                    name="address"
                    value={newCompanyData.address}
                    onChange={handleNewCompanyInputChange}
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="new-description">Company Description</label>
                  <textarea
                    id="new-description"
                    name="description"
                    value={newCompanyData.description}
                    onChange={handleNewCompanyInputChange}
                    rows={4}
                    maxLength={500}
                  />
                  <div className="char-counter">
                    <span className={newCompanyData.description.length > 450 ? "warning" : ""}>
                      {newCompanyData.description.length}/500
                    </span>
                  </div>
                </div>
                
                <div className="form-actions">
                  <button type="submit" className="action-btn save-btn">
                    Create Company
                  </button>
                  <button 
                    type="button" 
                    className="action-btn cancel-btn"
                    onClick={() => setShowAddCompanyModal(false)}
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
              <h3>Confirm Delete Company</h3>
              <p>
                Are you sure you want to delete the company <strong>{selectedCompany.companyName}</strong>?
              </p>
              <p className="warning-text">
                This action cannot be undone. All data associated with this company will be permanently deleted.
              </p>
              
              <div className="form-actions">
                <button 
                  className="action-btn delete-btn"
                  onClick={handleDeleteCompany}
                >
                  Delete Company
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

export default CompanyManagement;
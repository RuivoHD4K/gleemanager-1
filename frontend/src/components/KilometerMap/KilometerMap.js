// Simplified KilometerMap.js - Server handles all logic

import React, { useState, useEffect } from 'react';
import { useToast } from '../Toast/ToastContext';
import { 
  MapPin, Calculator, Calendar, 
  Play, FileSpreadsheet, Route,
  AlertCircle, CheckCircle, Loader, X,
  Info
} from 'lucide-react';
import './KilometerMap.css';

const KilometerMapCard = () => {
  const toast = useToast();
  
  // State management
  const [routes, setRoutes] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedRoutes, setSelectedRoutes] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [targetDistance, setTargetDistance] = useState('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState(null);
  const [errorDetails, setErrorDetails] = useState('');

  // Fetch initial data
  useEffect(() => {
    fetchRoutes();
    fetchTemplates();
  }, []);

  const fetchRoutes = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch('http://localhost:5000/routes', {
        headers: { "Authorization": `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setRoutes(data);
        console.log('Fetched routes:', data);
      } else {
        throw new Error(`Failed to fetch routes: ${response.status}`);
      }
    } catch (error) {
      console.error('Error fetching routes:', error);
      setErrorDetails(`Routes error: ${error.message}`);
      toast.showError('Failed to load routes');
    }
  };

  const fetchTemplates = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch('http://localhost:5000/excel-templates', {
        headers: { "Authorization": `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        const activeTemplates = data.filter(template => template.isActive);
        setTemplates(activeTemplates);
        console.log('Fetched templates:', activeTemplates);
      } else {
        throw new Error(`Failed to fetch templates: ${response.status}`);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
      setErrorDetails(`Templates error: ${error.message}`);
      toast.showError('Failed to load Excel templates');
    }
  };

  const handleRouteToggle = (routeId) => {
    setSelectedRoutes(prev => 
      prev.includes(routeId) 
        ? prev.filter(id => id !== routeId)
        : [...prev, routeId]
    );
  };

  const generateKilometerMap = async () => {
    // Clear previous errors
    setErrorDetails('');
    
    // Validation
    if (selectedRoutes.length === 0) {
      setErrorDetails('Please select at least one route');
      toast.showError('Please select at least one route');
      return;
    }
    
    if (!selectedTemplate) {
      setErrorDetails('Please select an Excel template');
      toast.showError('Please select an Excel template');
      return;
    }
    
    if (!targetDistance || parseFloat(targetDistance) <= 0) {
      setErrorDetails('Please enter a valid target distance');
      toast.showError('Please enter a valid target distance');
      return;
    }

    setIsGenerating(true);
    setGenerationResult(null);

    try {
      console.log('Starting kilometer map generation...');
      
      // Send only the essential data to server
      const requestData = {
        templateId: selectedTemplate,
        year: currentMonth.getFullYear(),
        month: currentMonth.getMonth() + 1, // Convert to 1-based month
        selectedRoutes: selectedRoutes,
        targetDistance: parseFloat(targetDistance)
      };

      console.log('Sending request data:', requestData);

      const token = localStorage.getItem("authToken");
      const response = await fetch('http://localhost:5000/generate-kilometer-map', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
      });
      
      if (response.ok) {
        // Check if response is JSON (success info) or binary (file)
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
          // It's a JSON response with generation details
          const result = await response.json();
          setGenerationResult(result);
          toast.showSuccess('Kilometer map generated successfully!');
        } else {
          // It's a file download
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = `kilometer_map_${currentMonth.getFullYear()}_${String(currentMonth.getMonth() + 1).padStart(2, '0')}.xlsx`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          
          toast.showSuccess('Kilometer map generated and downloaded successfully!');
        }
      } else {
        const errorText = await response.text();
        let errorMsg = 'Failed to generate Excel file';
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMsg = errorJson.error || errorMsg;
          if (errorJson.details) {
            console.error('Server error details:', errorJson.details);
          }
        } catch (e) {
          errorMsg = errorText || errorMsg;
        }
        
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error('Error generating kilometer map:', error);
      setErrorDetails(error.message);
      toast.showError(`Failed to generate kilometer map: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const getTotalSelectedDistance = () => {
    return routes
      .filter(route => selectedRoutes.includes(route.routeId))
      .reduce((total, route) => total + route.routeLength, 0);
  };

  const formatMonth = (date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric'
    }).format(date);
  };

  const changeMonth = (direction) => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + direction);
      return newDate;
    });
    setGenerationResult(null); // Reset results when month changes
    setErrorDetails(''); // Clear errors
  };

  const clearErrorDetails = () => {
    setErrorDetails('');
  };

  return (
    <div className="kilometer-map-card">
      <div className="km-header">
        <div className="km-header-title">
          <MapPin size={24} className="km-icon" />
          <h3>Kilometer Map Generator</h3>
        </div>
        <div className="km-month-selector">
          <button onClick={() => changeMonth(-1)} className="km-month-btn">❮</button>
          <span className="km-current-month">{formatMonth(currentMonth)}</span>
          <button onClick={() => changeMonth(1)} className="km-month-btn">❯</button>
        </div>
      </div>

      <div className="km-content">
        {/* Error Display */}
        {errorDetails && (
          <div className="km-error-section">
            <div className="km-error-header">
              <AlertCircle size={18} />
              <span>Error Details</span>
              <button onClick={clearErrorDetails} className="km-error-close">
                <X size={16} />
              </button>
            </div>
            <div className="km-error-message">{errorDetails}</div>
          </div>
        )}

        {/* Info Section */}
        <div className="km-section">
          <h4><Info size={18} /> How it works</h4>
          <div className="km-info">
            <Info size={16} />
            <div className="km-info-text">
              <p>
                Select your routes and target distance for <strong>{formatMonth(currentMonth)}</strong>. 
                The system will automatically avoid weekends, your personal holidays, and national holidays, 
                then distribute your selected routes to reach the target distance.
              </p>
            </div>
          </div>
        </div>

        <div className="km-section">
          <h4><Route size={18} /> Select Routes</h4>
          <div className="km-routes-grid">
            {routes.length === 0 ? (
              <p className="km-no-data">No routes available. Please add routes first.</p>
            ) : (
              routes.map(route => (
                <div 
                  key={route.routeId} 
                  className={`km-route-card ${selectedRoutes.includes(route.routeId) ? 'selected' : ''}`}
                  onClick={() => handleRouteToggle(route.routeId)}
                >
                  <div className="km-route-info">
                    <span className="km-route-name">
                      {route.startLocation} → {route.destination}
                    </span>
                    <span className="km-route-distance">{route.routeLength} km</span>
                  </div>
                  {selectedRoutes.includes(route.routeId) && (
                    <CheckCircle size={16} className="km-selected-icon" />
                  )}
                </div>
              ))
            )}
          </div>
          {selectedRoutes.length > 0 && (
            <div className="km-selection-summary">
              <span>Selected: {selectedRoutes.length} routes</span>
              <span>Total available: {getTotalSelectedDistance().toFixed(1)} km</span>
            </div>
          )}
        </div>

        {/* Template Selection */}
        <div className="km-section">
          <h4><FileSpreadsheet size={18} /> Excel Template</h4>
          <select 
            value={selectedTemplate} 
            onChange={(e) => setSelectedTemplate(e.target.value)}
            className="km-template-select"
          >
            <option value="">Select a template...</option>
            {templates.map(template => (
              <option key={template.templateId} value={template.templateId}>
                {template.name}
              </option>
            ))}
          </select>
          {templates.length === 0 && (
            <p className="km-warning">No active templates available. Please upload templates first.</p>
          )}
        </div>

        {/* Target Distance */}
        <div className="km-section">
          <h4><Calculator size={18} /> Target Distance</h4>
          <div className="km-distance-input">
            <input
              type="number"
              value={targetDistance}
              onChange={(e) => setTargetDistance(e.target.value)}
              placeholder="Enter target distance..."
              className="km-distance-field"
              min="0"
              step="0.1"
            />
            <span className="km-distance-unit">km</span>
          </div>
        </div>

        {/* Generation Results */}
        {generationResult && (
          <div className="km-section km-results">
            <h4><CheckCircle size={18} /> Generation Results</h4>
            <div className="km-results-grid">
              <div className="km-result-item">
                <span className="km-result-label">Target Distance:</span>
                <span className="km-result-value">{generationResult.targetDistance.toFixed(1)} km</span>
              </div>
              <div className="km-result-item">
                <span className="km-result-label">Actual Distance:</span>
                <span className="km-result-value">{generationResult.totalDistance.toFixed(1)} km</span>
              </div>
              <div className="km-result-item">
                <span className="km-result-label">Excess:</span>
                <span className="km-result-value">+{generationResult.excess.toFixed(1)} km</span>
              </div>
              <div className="km-result-item">
                <span className="km-result-label">Routes Used:</span>
                <span className="km-result-value">{generationResult.routeCount}</span>
              </div>
              <div className="km-result-item">
                <span className="km-result-label">Days Used:</span>
                <span className="km-result-value">{generationResult.daysUsed}</span>
              </div>
            </div>
            
            {generationResult.summary && (
              <div className="km-distribution-preview">
                <h5>Generation Summary:</h5>
                <div className="km-info-text">
                  <p>{generationResult.summary}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Generate Button */}
        <div className="km-actions">
          <button 
            onClick={generateKilometerMap}
            disabled={isGenerating || selectedRoutes.length === 0 || !selectedTemplate || !targetDistance}
            className="km-generate-btn"
          >
            {isGenerating ? (
              <>
                <Loader size={18} className="km-spinner" />
                Generating...
              </>
            ) : (
              <>
                <Play size={18} />
                Generate Kilometer Map
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default KilometerMapCard;
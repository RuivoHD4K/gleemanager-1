import React, { useState, useEffect } from 'react';
import './LoadingSpinner.css';

const LoadingSpinner = ({ isLoading, children, timeout = 3000 }) => {
  const [showContent, setShowContent] = useState(!isLoading);
  const [fadeIn, setFadeIn] = useState(!isLoading);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let timeoutId;
    let fadeTimeoutId;

    if (isLoading) {
      // Reset states when loading starts
      setShowContent(false);
      setFadeIn(false);
      setTimedOut(false);
      
      // Set timeout to show content even if loading doesn't finish
      timeoutId = setTimeout(() => {
        setTimedOut(true);
        setShowContent(true);
        
        // Add fade-in effect after showing content
        fadeTimeoutId = setTimeout(() => {
          setFadeIn(true);
        }, 50); // small delay to ensure the DOM has updated
      }, timeout);
    } else {
      // When loading is done, show content with fade-in
      setShowContent(true);
      
      // Add fade-in effect after showing content
      fadeTimeoutId = setTimeout(() => {
        setFadeIn(true);
      }, 50); // small delay to ensure the DOM has updated
    }

    return () => {
      clearTimeout(timeoutId);
      clearTimeout(fadeTimeoutId);
    };
  }, [isLoading, timeout]);

  return (
    <div className="loading-container">
      {(isLoading && !timedOut) && (
        <div className="spinner-overlay">
          <div className="spinner-container">
            <div className="spinner"></div>
            <p>Loading...</p>
          </div>
        </div>
      )}
      <div className={`content-container ${showContent ? 'visible' : 'hidden'} ${fadeIn ? 'fade-in' : ''}`}>
        {children}
      </div>
    </div>
  );
};

export default LoadingSpinner;
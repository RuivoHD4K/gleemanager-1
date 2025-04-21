import React, { createContext, useState, useContext } from 'react';
import ToastContainer from './ToastContainer';

// Create the context
const ToastContext = createContext();

// Generate unique IDs for toasts
let toastId = 1;

// Provider component
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  // Add a toast
  const addToast = (message, type = 'info') => {
    const id = `toast-${toastId++}`;
    setToasts(prev => [...prev, { id, message, type }]);
    return id;
  };

  // Remove a toast
  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  // Helper functions for common toast types
  const showSuccess = (message) => addToast(message, 'success');
  const showError = (message) => addToast(message, 'error');
  const showInfo = (message) => addToast(message, 'info');
  const showWarning = (message) => addToast(message, 'warning');

  return (
    <ToastContext.Provider value={{ addToast, removeToast, showSuccess, showError, showInfo, showWarning }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
};

// Custom hook to use the toast context
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

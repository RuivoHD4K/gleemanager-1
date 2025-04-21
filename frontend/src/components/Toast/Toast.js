import React, { useEffect } from 'react';

const Toast = ({ message, type, onClose, id }) => {
  useEffect(() => {
    // Auto-close toast after 5 seconds
    const timer = setTimeout(() => {
      onClose(id);
    }, 5000);

    return () => clearTimeout(timer);
  }, [onClose, id]);

  return (
    <div className={`toast-notification ${type}`}>
      <div className="toast-content">
        <span className="toast-message">{message}</span>
      </div>
      <button className="toast-close" onClick={() => onClose(id)}>×</button>
    </div>
  );
};

export default Toast;
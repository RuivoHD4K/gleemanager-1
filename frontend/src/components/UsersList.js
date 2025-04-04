import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const UsersList = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch("http://localhost:5000/users", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          // Handle unauthorized (invalid/expired token)
          localStorage.removeItem("authToken");
          localStorage.removeItem("isAuthenticated");
          navigate("/login");
          throw new Error("Your session has expired. Please log in again.");
        }
        throw new Error("Failed to fetch users");
      }
      
      const data = await response.json();
      setUsers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading-indicator">Loading users...</div>;
  if (error) return <div className="error-message">Error: {error}</div>;

  return (
    <div className="dashboard-card">
      <h3>Users in Database</h3>
      {users.length === 0 ? (
        <p>No users found</p>
      ) : (
        <div className="users-table-container">
          <table className="users-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Created</th>
                <th>Role</th>
                <th>User ID</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, index) => (
                <tr key={user.userId || index}>
                  <td>{user.email}</td>
                  <td>{new Date(user.createdAt).toLocaleString()}</td>
                  <td className="user-role-cell">{user.role || "user"}</td>
                  <td className="user-id">{user.userId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default UsersList;
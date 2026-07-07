const jwt = require('jsonwebtoken');

// Secret key should be stored in .env file
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-for-hospital-dev';

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  // NOTE: This middleware is currently bypassed (commented out in routes)
  // to allow frontend development to continue without breaking.
  // Uncomment the usage in routes once the login system is implemented.
  
  const authHeader = req.headers['authorization'];
  // The header usually looks like: "Bearer TOKEN_STRING"
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
    
    // Attach user payload to request for further use in route
    req.user = user;
    next();
  });
};

module.exports = authenticateToken;

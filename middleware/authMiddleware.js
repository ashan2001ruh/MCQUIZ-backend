const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  console.log('Auth middleware - Token received:', token ? 'Token exists' : 'No token');
  console.log('Auth middleware - Request URL:', req.url);
  console.log('Auth middleware - Request method:', req.method);
  
  if (!token) {
    console.log('Auth middleware - No token provided');
    return res.status(401).json({ message: 'Authentication required' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Auth middleware - Token decoded successfully:', decoded);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('JWT verification error:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
};

const isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied: Admin privileges required' });
  }
  
  next();
};

module.exports = {
  authenticate,
  isAdmin
};
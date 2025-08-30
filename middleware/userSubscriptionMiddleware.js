const User = require('../models/model');

// Middleware to check if user has access to specific subscription level
const checkSubscriptionAccess = (requiredLevel) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.userId;
      
      const user = await User.findById(userId).select('subscriptionLevels');
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Check if user has required subscription level
      if (!user.subscriptionLevels.includes(requiredLevel)) {
        return res.status(403).json({ 
          message: `Access denied. ${requiredLevel} subscription required.`,
          requiredLevel: requiredLevel,
          userLevels: user.subscriptionLevels
        });
      }

      req.userSubscriptions = user.subscriptionLevels;
      next();
    } catch (error) {
      console.error('Subscription access check error:', error);
      res.status(500).json({ message: 'Server error during access check' });
    }
  };
};

// Middleware to check if user has access to any of the specified levels
const checkAnySubscriptionAccess = (requiredLevels) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.userId;
      
      const user = await User.findById(userId).select('subscriptionLevels');
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Check if user has any of the required subscription levels
      const hasAccess = requiredLevels.some(level => user.subscriptionLevels.includes(level));
      
      if (!hasAccess) {
        return res.status(403).json({ 
          message: `Access denied. One of these subscriptions required: ${requiredLevels.join(', ')}`,
          requiredLevels: requiredLevels,
          userLevels: user.subscriptionLevels
        });
      }

      req.userSubscriptions = user.subscriptionLevels;
      next();
    } catch (error) {
      console.error('Subscription access check error:', error);
      res.status(500).json({ message: 'Server error during access check' });
    }
  };
};

// Middleware to get user's subscription levels and attach to request
const attachSubscriptionInfo = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId).select('subscriptionLevels');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    req.userSubscriptions = user.subscriptionLevels;
    next();
  } catch (error) {
    console.error('Attach subscription info error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Middleware to filter content based on user's subscription level
const filterBySubscription = (req, res, next) => {
  // This middleware can be used to filter quiz/subject content
  // based on user's subscription levels
  req.subscriptionFilter = req.userSubscriptions || ['Basic'];
  next();
};

module.exports = {
  checkSubscriptionAccess,
  checkAnySubscriptionAccess,
  attachSubscriptionInfo,
  filterBySubscription
};
const User = require('../models/model');
const Subscription = require('../models/subscription');

// Get all subscriptions with user details
const getAllSubscriptions = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (status) {
      query.status = status;
    }

    const subscriptions = await Subscription.find(query)
      .populate('userId', 'firstName lastName email subscriptionLevel')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Subscription.countDocuments(query);

    res.status(200).json({
      subscriptions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get all subscriptions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get subscription statistics
const getSubscriptionStats = async (req, res) => {
  try {
    // Get total users count
    const totalUsers = await User.countDocuments({ role: 'user' });

    // Get subscription level distribution
    const subscriptionLevels = await User.aggregate([
      { $match: { role: 'user' } },
      {
        $group: {
          _id: '$subscriptionLevel',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get pending subscription requests count (both pending payment and paid awaiting approval)
    const pendingRequests = await Subscription.countDocuments({ 
      status: { $in: ['pending', 'paid'] } 
    });

    // Get accepted subscription requests count
    const acceptedRequests = await Subscription.countDocuments({ status: 'success' });

    // Get monthly subscription trends (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyTrends = await Subscription.aggregate([
      {
        $match: {
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          success: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Get recent subscription activity
    const recentActivity = await Subscription.find()
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(10);

    res.status(200).json({
      totalUsers,
      subscriptionLevels,
      pendingRequests,
      acceptedRequests,
      monthlyTrends,
      recentActivity
    });
  } catch (error) {
    console.error('Get subscription stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Approve subscription
const approveSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;

    const subscription = await Subscription.findById(subscriptionId);
    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    if (!['pending', 'paid'].includes(subscription.status)) {
      return res.status(400).json({ 
        message: 'Only pending or paid subscriptions can be approved' 
      });
    }

    // Update subscription status
    subscription.status = 'success';
    await subscription.save();

    // Update user's subscription level
    const user = await User.findById(subscription.userId);
    if (user) {
      user.subscriptionLevel = subscription.planType;
      await user.save();
    }

    // Return updated subscription with user details
    const updatedSubscription = await Subscription.findById(subscriptionId)
      .populate('userId', 'firstName lastName email subscriptionLevel');

    res.status(200).json({
      message: 'Subscription approved successfully',
      subscription: updatedSubscription
    });
  } catch (error) {
    console.error('Approve subscription error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Reject subscription
const rejectSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const { reason } = req.body;

    const subscription = await Subscription.findById(subscriptionId);
    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    if (!['pending', 'paid'].includes(subscription.status)) {
      return res.status(400).json({ 
        message: 'Only pending or paid subscriptions can be rejected' 
      });
    }

    // Update subscription status
    subscription.status = 'failed';
    if (reason) {
      subscription.rejectionReason = reason;
    }
    await subscription.save();

    // Return updated subscription with user details
    const updatedSubscription = await Subscription.findById(subscriptionId)
      .populate('userId', 'firstName lastName email subscriptionLevel');

    res.status(200).json({
      message: 'Subscription rejected successfully',
      subscription: updatedSubscription
    });
  } catch (error) {
    console.error('Reject subscription error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all users with subscription info
const getAllUsersWithSubscriptions = async (req, res) => {
  try {
    const { page = 1, limit = 10, subscriptionLevel, search } = req.query;
    const skip = (page - 1) * limit;

    let userQuery = { role: 'user' };
    if (subscriptionLevel) {
      userQuery.subscriptionLevel = subscriptionLevel;
    }
    if (search) {
      userQuery.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(userQuery)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get subscription details for each user
    const usersWithSubscriptions = await Promise.all(
      users.map(async (user) => {
        const activeSubscription = await Subscription.findOne({
          userId: user._id,
          status: 'success',
          endDate: { $gt: new Date() }
        }).sort({ createdAt: -1 });

        const pendingSubscription = await Subscription.findOne({
          userId: user._id,
          status: 'pending'
        }).sort({ createdAt: -1 });

        const totalSubscriptions = await Subscription.countDocuments({
          userId: user._id
        });

        return {
          ...user.toObject(),
          activeSubscription,
          pendingSubscription,
          totalSubscriptions
        };
      })
    );

    const total = await User.countDocuments(userQuery);

    res.status(200).json({
      users: usersWithSubscriptions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get all users with subscriptions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update user subscription level manually
const updateUserSubscriptionLevel = async (req, res) => {
  try {
    const { userId } = req.params;
    const { subscriptionLevel } = req.body;

    const validLevels = ['basic', 'Basic', 'School Pro', 'O/L Pro', 'A/L Pro', 'school', 'ol_pro', 'al_pro'];
    if (!validLevels.includes(subscriptionLevel)) {
      return res.status(400).json({ message: 'Invalid subscription level' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { subscriptionLevel },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({
      message: 'User subscription level updated successfully',
      user
    });
  } catch (error) {
    console.error('Update user subscription level error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAllSubscriptions,
  getSubscriptionStats,
  approveSubscription,
  rejectSubscription,
  getAllUsersWithSubscriptions,
  updateUserSubscriptionLevel
};

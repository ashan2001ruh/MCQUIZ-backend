const User = require('../models/model');
const Subscription = require('../models/subscription');
const crypto = require('crypto');

const initializePayment = async (req, res) => {
  try {
    const { planType, amount } = req.body;
    
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const orderId = `MC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    const subscription = new Subscription({
      userId: req.user.userId,
      planType,
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      orderId,
      amount,
      status: 'pending'
    });
    
    await subscription.save();
    
    const merchantId = process.env.PAYHERE_MERCHANT_ID;
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
    
    const formattedAmount = amount.toFixed(2);
    const currency = 'LKR';
    
    const hash = crypto
      .createHash('md5')
      .update(merchantId + orderId + formattedAmount + currency + 
              crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase())
      .digest('hex')
      .toUpperCase();
    
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.status(200).json({
      success: true,
      paymentData: {
        merchant_id: merchantId,
        return_url: `${process.env.FRONTEND_URL}/courses`,
        cancel_url: `${process.env.FRONTEND_URL}/pricing`,
        notify_url: `${process.env.HOST}/api/payment/notify`,
        order_id: orderId,
        items: planType,
        amount: formattedAmount,
        currency,
        first_name: user.firstName || '',
        last_name: user.lastName || '',
        email: user.email,
        phone: '',
        address: '',
        city: '',
        country: 'Sri Lanka',
        hash,
        custom_1: req.user.userId
      }
    });
  } catch (error) {
    console.error('Payment initialization error:', error);
    res.status(500).json({ message: 'Server error during payment initialization' });
  }
};

const handlePaymentNotification = async (req, res) => {
  try {
    const {
      merchant_id,
      order_id,
      payment_id,
      payhere_amount,
      payhere_currency,
      status_code,
      md5sig,
      custom_1,
      method
    } = req.body;
    
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
    
    const calculatedMd5sig = crypto
      .createHash('md5')
      .update(
        merchant_id +
        order_id +
        payhere_amount +
        payhere_currency +
        status_code +
        crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase()
      )
      .digest('hex')
      .toUpperCase();
    
    if (calculatedMd5sig !== md5sig) {
      console.error('Invalid payment signature');
      return res.status(400).json({ message: 'Invalid payment signature' });
    }
    
    const statusMap = {
      '2': 'success',
      '0': 'pending',
      '-1': 'canceled',
      '-2': 'failed',
      '-3': 'chargedback'
    };
    
    const subscription = await Subscription.findOne({ orderId: order_id });
    
    if (!subscription) {
      console.error('Subscription not found for order:', order_id);
      return res.status(404).json({ message: 'Subscription not found' });
    }
    
    subscription.status = statusMap[status_code] || 'pending';
    subscription.paymentId = payment_id;
    
    await subscription.save();
    
    res.status(200).send('Payment notification received');
  } catch (error) {
    console.error('Payment notification handling error:', error);
    res.status(500).json({ message: 'Server error during payment notification handling' });
  }
};

const getUserSubscription = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const subscription = await Subscription.findOne({
      userId: req.user.userId,
      status: 'success',
      endDate: { $gt: new Date() }
    }).sort({ createdAt: -1 });
    
    res.status(200).json({ subscription });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  initializePayment,
  handlePaymentNotification,
  getUserSubscription
};
# PayHere Payment Gateway Setup

## Overview
This application integrates with PayHere payment gateway for subscription payments. This document explains how to set up the PayHere integration.

## Required Environment Variables

Add these variables to your `.env` file in the backend root directory:

```env
# PayHere Configuration
PAYHERE_MERCHANT_ID=your_merchant_id
PAYHERE_MERCHANT_SECRET=your_merchant_secret

# Application URLs
FRONTEND_URL=http://localhost:3000
HOST=http://localhost
PORT=3001
```

## PayHere Account Setup

### 1. Create PayHere Account
- Go to [PayHere](https://www.payhere.lk/)
- Sign up for a merchant account
- Complete the account verification process

### 2. Get Merchant Credentials
- Login to your PayHere merchant dashboard
- Navigate to Settings > Domains & Credentials
- Copy your Merchant ID and Merchant Secret
- For testing, use the sandbox credentials

### 3. Configure Domain/URLs
- Add your domain to the allowed domains list
- Set up return URLs and notify URLs in your PayHere dashboard

## Testing vs Production

### Sandbox/Testing
```env
# Use PayHere sandbox URL in the frontend
# The payment form action should be: https://sandbox.payhere.lk/pay/checkout
```

### Production
```env
# Use PayHere live URL in the frontend  
# The payment form action should be: https://www.payhere.lk/pay/checkout
```

## Subscription Plans

The application supports the following subscription plans:

1. **School Pro** - Rs. 1,500/year
   - Grade 5 Scholarship preparation
   - Immediate feedback on answers
   - Full timed practice tests

2. **O/L Pro** - Rs. 2,000/year
   - O/L subject-based MCQs
   - Instant feedback system
   - Subject-specific timed tests

3. **A/L Pro** - Rs. 2,500/year
   - A/L categorized MCQs
   - Real-time answer feedback
   - Exam simulation mode

## Payment Flow

1. User selects a subscription plan
2. System creates a pending subscription record
3. PayHere payment form is submitted
4. User completes payment on PayHere
5. PayHere sends notification to our webhook
6. System verifies payment and updates user subscription
7. User is redirected back to profile page

## Webhook Configuration

PayHere will send payment notifications to:
```
POST http://localhost:3001/api/payment/notify
```

Make sure this URL is accessible from the internet for production use.

## Security

- Payment verification uses MD5 signature validation
- All payment data is validated against PayHere's response
- User subscription is only updated on successful payment verification

## Troubleshooting

**Common Issues:**

1. **Invalid signature error**
   - Check your merchant secret is correct
   - Verify the hash calculation matches PayHere's method

2. **Payment not updating subscription**
   - Check the webhook URL is accessible
   - Verify the payment notification is being received
   - Check server logs for any errors

3. **Redirect URLs not working**
   - Ensure FRONTEND_URL environment variable is set correctly
   - Check the return_url and cancel_url in payment initialization

## Testing

To test the payment system:

1. Use PayHere sandbox credentials
2. Use test card numbers provided by PayHere
3. Monitor server logs for payment notifications
4. Verify subscription updates in the database

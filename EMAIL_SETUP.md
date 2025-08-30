# Email Setup for Password Reset Functionality

## Overview
The password reset functionality requires email configuration to send OTP codes to users. This document explains how to set up the email service.

## Required Environment Variables
Create a `.env` file in the backend root directory with the following variables:

```env
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-specific-password
```

## Gmail Setup Instructions

### 1. Enable 2-Factor Authentication
- Go to your Google Account settings
- Navigate to Security
- Enable 2-Step Verification

### 2. Generate App-Specific Password
- Go to Google Account settings
- Navigate to Security > 2-Step Verification
- Click on "App passwords"
- Generate a new app password for "Mail"
- Use this generated password in your `.env` file

### 3. Important Notes
- **NEVER use your regular Gmail password**
- **ALWAYS use an app-specific password**
- The app-specific password is 16 characters long
- Keep your `.env` file secure and never commit it to version control

## Alternative Email Services
You can modify the `createTransporter()` function in `controllers/passwordResetController.js` to use other email services like:
- Outlook/Hotmail
- Yahoo
- Custom SMTP servers

## Testing
To test the email functionality:
1. Start your backend server
2. Try the password reset flow from the frontend
3. Check your email for the OTP code
4. Verify the password reset works correctly

## Troubleshooting
- **"Invalid login" error**: Check your email and app-specific password
- **"Authentication failed"**: Ensure 2FA is enabled and app password is correct
- **"Connection timeout"**: Check your internet connection and firewall settings 
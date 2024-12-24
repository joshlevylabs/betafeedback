const sgMail = require('@sendgrid/mail');
require('dotenv').config();  // Load .env file

sgMail.setApiKey(process.env.SENDGRID_API_KEY);  // Load API key from .env

const msg = {
  to: 'joshual@sonance.com',  // Replace with your recipient email
  from: 'verified-email@yourdomain.com',  // Use your verified sender email
  subject: 'Test Email from SendGrid',
  text: 'This is a test email to verify SendGrid integration.'
};

sgMail.send(msg)
  .then(() => console.log('✅ Test email sent successfully.'))
  .catch((error) => console.error('❌ Test email failed:', error.response.body));

const sgMail = require('@sendgrid/mail');
require('dotenv').config();  // Load .env file

sgMail.setApiKey(process.env.SENDGRID_API_KEY);  // Load API key from .env

const msg = {
  to: 'joshual@sonance.com',  // Replace with your recipient email
  from: 'sonance991@gmail.com',  // Use your verified sender email
  subject: 'Test Email from SendGrid',
  text: 'This is a test email to verify SendGrid integration.',
  html: '<strong>This is a test email to verify SendGrid integration.</strong>',
  headers: {
    'Precedence': 'bulk',  // Marks as non-spam bulk email
    'List-Unsubscribe': '<mailto:unsubscribe@sonance.com>'  // Optional
  }
};

sgMail.send(msg)
  .then(() => console.log('✅ Test email sent successfully.'))
  .catch((error) => console.error('❌ Test email failed:', error.response.body));

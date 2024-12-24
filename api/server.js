const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const sgMail = require('@sendgrid/mail');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Set up SendGrid API Key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Serve static files directly from the root directory (for Vercel)
app.use(express.static(path.join(__dirname)));

// Question mapping (for full question content)
const questionMap = {
    arc1: "1. Enable low brightness mode. Is the LED brightness acceptable?",
    arc2: "2. Verify the protection LED. Is it working without delays?",
    narc1: "1. Is the NARC connecting to Bluetooth properly?"
};

// API Endpoint for Homework Submission
app.post('/submit-homework', (req, res) => {
    const formData = req.body;
    const emailContent = formatEmail(formData);

    const mailOptions = {
        to: 'joshual@sonance.com',
        from: 'sonance991@gmail.com',  // Use verified sender
        subject: 'Homework Submission',
        text: emailContent,
        html: `<div style="font-family: Arial, sans-serif;">
                   <h2>Homework Submission</h2>
                   ${emailContent}
               </div>`,
        headers: {
            'Precedence': 'bulk',
            'List-Unsubscribe': '<mailto:unsubscribe@sonance.com>'
        }
    };

    sgMail.send(mailOptions)
        .then(() => {
            console.log('✅ Email sent successfully.');
            res.status(200).json({ message: 'Email sent successfully.' });
        })
        .catch((error) => {
            console.error('❌ Error sending email:', error.response.body);
            res.status(500).json({ 
                error: 'Failed to send email.', 
                details: error.response.body
            });
        });
});

// Helper to format email content
function formatEmail(data) {
    let emailBody = '<ol>';
    for (const [key, value] of Object.entries(data)) {
        const question = questionMap[key] || key;  // Fallback to ID if no match
        emailBody += `<li><strong>${question}</strong><br>Answer: ${value}</li>`;
    }
    emailBody += '</ol>';
    return emailBody;
}

// Start the server (only for local development)
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

// Export for Vercel
module.exports = app;

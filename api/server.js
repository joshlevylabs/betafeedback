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

// Debugging middleware to log all incoming requests
app.use((req, res, next) => {
    console.log(`🔍 Received request: ${req.method} ${req.url}`);
    next();
});

// Handle PDF and static file requests with detailed logging
app.get('/:filename', (req, res) => {
    const filePath = path.join(__dirname, req.params.filename);

    console.log(`📂 Attempting to serve file: ${req.params.filename}`);
    console.log(`🔍 Resolved file path: ${filePath}`);

    res.sendFile(filePath, (err) => {
        if (err) {
            console.error('❌ Error serving file:', err.message);
            res.status(404).send(`404 - File Not Found: ${req.params.filename}`);
        } else {
            console.log(`✅ Successfully served: ${req.params.filename}`);
        }
    });
});

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

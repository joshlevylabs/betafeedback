const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const sgMail = require('@sendgrid/mail');
require('dotenv').config();  // Load environment variables from .env

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors());

// Set SendGrid API Key from .env
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

app.post('/submit-homework', (req, res) => {
    console.log('Received POST request to /submit-homework');
    console.log('Request body:', req.body);

    if (!req.body || Object.keys(req.body).length === 0) {
        console.error('Empty request body');
        return res.status(400).json({ error: 'No data submitted' });
    }

    const formData = req.body;
    console.log('Form Data:', formData);

    const mailOptions = {
        to: 'joshual@sonance.com',    // Replace with recipient email
        from: 'sonance991@gmail.com', // Verified sender email
        subject: 'Homework Assignment Submission',
        text: formatEmail(formData)
    };

    sgMail
        .send(mailOptions)
        .then(() => {
            console.log('Email sent successfully.');
            res.status(200).json({ message: 'Email sent successfully.' });
        })
        .catch((error) => {
            console.error('Error sending email:', error.response.body);  // Log the exact SendGrid error
            res.status(500).json({ error: 'Failed to send email.', details: error.response.body });
        });

});

// Helper to format email content
function formatEmail(data) {
    return Object.entries(data)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
}

// Serve thank-you.html after submission
app.get('/thank-you', (req, res) => {
    res.sendFile(path.join(__dirname, '../thank-you.html'));
});

// Export for Vercel
module.exports = app;

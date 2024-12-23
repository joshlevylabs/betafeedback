const express = require('express');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors());

// Serve static files (like homework.html and thank-you.html)
app.use(express.static(path.join(__dirname, '..')));

// Nodemailer setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'your-email@gmail.com',  // Use your Gmail address
        pass: 'your-app-password'      // Use app-specific password
    }
});

// Handle form submission from homework.html
app.post('/submit-homework', (req, res) => {
    const formData = req.body;

    const mailOptions = {
        from: 'your-email@gmail.com',
        to: 'joshual@sonance.com',
        subject: 'Homework Assignment Submission',
        text: formatEmail(formData)
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error:', error);
            return res.status(500).send('Failed to send email.');
        } else {
            console.log('Email sent:', info.response);
            res.status(200).json({ message: 'Email sent successfully.' });
        }
    });
});

// Helper to format the email content
function formatEmail(data) {
    return Object.entries(data).map(([key, value]) => `${key}: ${value}`).join('\n');
}

// Serve thank-you.html after submission
app.get('/thank-you', (req, res) => {
    res.sendFile(path.join(__dirname, '../thank-you.html'));
});

// Export for Vercel (no need for app.listen)
module.exports = app;

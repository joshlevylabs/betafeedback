// @ts-nocheck
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
app.use(express.static(path.join(__dirname)));

// Nodemailer setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'your-email@gmail.com',  // Replace with your email
        pass: 'your-app-password'      // Use an app-specific password
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
            res.status(500).json({ message: 'Error sending email.' });
        } else {
            console.log('Email sent:', info.response);
            res.status(200).json({ message: 'Email successfully sent.' });
        }
    });
});

// Helper to format the email content
function formatEmail(data) {
    return Object.entries(data)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
}

// Serve thank-you.html after form submission
app.get('/thank-you', (req, res) => {
    res.sendFile(path.join(__dirname, 'thank-you.html'));
});

// Vercel-compatible routing for API
app.all('/api/*', (req, res) => {
    res.status(404).json({ message: 'API route not found.' });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://www.sonance-beta.info:${PORT}`);
});

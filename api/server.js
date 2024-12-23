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
        user: 'sonance991@gmail.com',  // Use your Gmail address
        pass: 'S0n@nce991!'            // App-specific password
    }
});

app.post('/submit-homework', (req, res) => {
    console.log('Received POST request to /submit-homework');
    console.log('Request body:', req.body);

    if (!req.body || Object.keys(req.body).length === 0) {
        console.error('Empty request body');
        return res.status(400).json({ error: 'No data submitted' });  // Ensure JSON response
    }

    const formData = req.body;
    console.log('Form Data:', formData);

    const mailOptions = {
        from: 'sonance991@gmail.com',
        to: 'joshual@sonance.com',
        subject: 'Homework Assignment Submission',
        text: formatEmail(formData)
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending email:', error);
            return res.status(500).json({ error: 'Failed to send email.' });  // Return JSON
        }
        console.log('Email sent successfully:', info.response);
        res.status(200).json({ message: 'Email sent successfully.' });
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

// Export for Vercel
module.exports = app;

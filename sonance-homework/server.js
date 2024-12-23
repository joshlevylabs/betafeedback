const express = require('express');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors());

// Nodemailer transporter setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'your-email@gmail.com',
        pass: 'your-app-password'  // Ensure you use an app-specific password
    }
});

// POST endpoint to receive form submissions
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
            console.log('Error:', error);
            res.status(500).send('Error sending email.');
        } else {
            console.log('Email sent:', info.response);
            res.status(200).send('Email successfully sent.');
        }
    });
});

// Helper function to format email content
function formatEmail(data) {
    return Object.entries(data).map(([key, value]) => `${key}: ${value}`).join('\n');
}

// Start server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

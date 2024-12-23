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
        user: 'your-email@gmail.com',
        pass: 'your-app-password'  // Use an app-specific password
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
            res.status(500).send('Error sending email.');
        } else {
            console.log('Email sent:', info.response);
            res.status(200).send('Email successfully sent.');
        }
    });
});

// Helper to format the email content
function formatEmail(data) {
    return Object.entries(data).map(([key, value]) => `${key}: ${value}`).join('\n');
}

// Serve thank-you.html after form submission
app.get('/thank-you.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'thank-you.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

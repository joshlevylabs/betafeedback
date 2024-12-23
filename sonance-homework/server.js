const express = require('express');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'your-email@gmail.com',
        pass: 'your-password'
    }
});

app.post('/submit-homework', (req, res) => {
    const formData = req.body;

    const mailOptions = {
        from: 'your-email@gmail.com',
        to: 'joshual@sonance.com',
        subject: 'Homework Submission',
        text: JSON.stringify(formData, null, 2)
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) res.status(500).send('Error sending email.');
        else res.status(200).send('Email sent successfully.');
    });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));

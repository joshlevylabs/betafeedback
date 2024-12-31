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

// Serve static files from public directory at the project root
app.use(express.static(path.join(__dirname, '..', 'public')));

// Debugging middleware to log all incoming requests
app.use((req, res, next) => {
    console.log(`🔍 Received request: ${req.method} ${req.url}`);
    next();
});

// Serve static files like PDFs from 'public' directory
app.get('/:filename', (req, res) => {
    const filePath = path.join(__dirname, '..', 'public', req.params.filename);

    console.log(`📂 Attempting to serve file: ${req.params.filename}`);
    console.log(`🔍 Resolved file path: ${filePath}`);

    res.sendFile(filePath, (err) => {
        if (err) {
            console.error(`❌ Error serving file: ${err.message}`);
            console.error(`👉 Full Path: ${filePath}`);
            console.error(`🔧 Troubleshooting: Ensure the file exists in the 'public' directory and the path is correct.`);
            
            res.status(404).send(`
                <h1>404 - File Not Found</h1>
                <p>The requested file <strong>${req.params.filename}</strong> could not be found at the expected location:</p>
                <code>${filePath}</code>
                <p>Please verify the file exists and try again.</p>
            `);
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
        from: 'sonance991@gmail.com',
        subject: 'Homework Submission',
        text: emailContent,
        html: `<div style="font-family: Arial, sans-serif;">
                   <h2>Homework Submission</h2>
                   ${emailContent}
               </div>`
    };

    sgMail.send(mailOptions)
        .then(() => {
            console.log('✅ Email sent successfully.');
            res.status(200).json({ message: 'Email sent successfully.' });
        })
        .catch((error) => {
            console.error('❌ Error sending email:', error.response.body);
            res.status(500).json({ error: 'Failed to send email.', details: error.response.body });
        });
});


// Helper to format email content
function formatEmail(data) {
    let emailBody = `Homework Submission:\n\n`;
    emailBody += `Email: ${data.email}\n\n`;
    emailBody += `Questions:\n`;

    let counter = 1;
    for (const [key, value] of Object.entries(data.responses)) {
        const question = questionMap[key] || key;  // Fallback to ID if no match
        emailBody += `${counter}. ${question}\n`;
        emailBody += `   - Answer: ${value.answer}\n`;

        if (value.feedback) {
            emailBody += `   - Feedback: ${value.feedback}\n`;
        }
        emailBody += `\n`;
        counter++;
    }
    
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

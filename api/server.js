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
    console.log(`🔍 Request to: ${req.url}`);
    next();
});

// Serve static files like PDFs from 'public' directory
app.get('/:filename', (req, res) => {
    const filePath = path.join(__dirname, '..', req.params.filename);  // Look in the root directory

    console.log(`📂 Attempting to serve file: ${req.params.filename}`);
    console.log(`🔍 Resolved file path: ${filePath}`);

    res.sendFile(filePath, (err) => {
        if (err) {
            console.error(`❌ Error serving file: ${err.message}`);
            res.status(404).send(`
                <h1>404 - File Not Found</h1>
                <p>The requested file <strong>${req.params.filename}</strong> could not be found at the expected location:</p>
                <code>${filePath}</code>
                <p>Please verify the file exists and try again.</p>
            `);
        }
    });
});

const arcQuestionMap = {
    arc1: "Enable low brightness mode. Is the LED brightness acceptable?",
    arc2: "Verify the protection LED. Is it working without delays?",
    arc3: "Did the amp unmute successfully when the volume up or down button was pressed?",
    arc4: "Did the TV remain muted after 30 seconds of activating the mute command?",
    arc5: "Was the remote successfully programmed to control the amp's power ON/OFF?",
    arc6: "Did the amp switch inputs correctly when testing the dual-source switchover?",
    arc7: "Were there any issues observed during rapid DSP EQ frequency adjustments?",
    arc8: "Did the amp reset to factory defaults successfully?"
};

const narcQuestionMap = {
    narc1: "Enable low brightness mode. Is the LED brightness acceptable?",
    narc2: "Verify the protection LED. Is it working without delays?",
    narc3: "Did the amp unmute successfully when the volume up or down button was pressed?",
    narc4: "Did the TV remain muted after 30 seconds of activating the mute command?",
    narc5: "Was the remote successfully programmed to control the amp's power ON/OFF?",
    narc6: "Did the amp switch inputs correctly when testing the dual-source switchover?",
    narc7: "Were there any issues observed during rapid DSP EQ frequency adjustments?"
};


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

    console.log('🔔 POST /submit-homework hit');
    res.json({ message: 'Homework submitted successfully' });

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

app.post('/api/server', (req, res) => {
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

    console.log('🔔 POST /api/server hit');
    res.json({ message: 'Homework submitted successfully' });

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


function formatEmail(data) {
    let emailBody = `Homework Submission:\n\n`;
    emailBody += `Email: ${data.email}\n\n`;
    emailBody += `Questions:\n`;

    // Determine which question map to use (ARC or NARC)
    const questionMap = data.deviceType === 'ARC' ? arcQuestionMap : narcQuestionMap;

    let counter = 1;
    for (const [key, value] of Object.entries(data.responses)) {
        const question = questionMap[key] || key;  // Fallback to key if not found
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

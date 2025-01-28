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
console.log('🔑 SENDGRID API KEY:', process.env.SENDGRID_API_KEY ? 'Exists' : 'Missing');


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
    arc1: 'Update FW. What firmware version are you updating FROM? What type of device are you using, and what version of the Sonarc app is installed?',
    arc2: 'What TV make and model are you using with your ARC?',
    arc3: 'Did you notice any issues when using eARC or ARC settings on your TV?.',
    arc4: 'Enable low brightness mode. Is the LED brightness acceptable? Test with different input sources (Analog and Digital) as well as Switchover behaviors (MUTE/MIX/DUCK).',
    arc5: 'Was the protection LED delayed, potentially confusing users?',
    arc6: 'Did the amp unmute successfully when the volume up or down button was pressed?',
    arc7: 'Did the TV remain muted after 30 seconds of activating the mute command?',
    arc8: 'Test all IR programming functions with your TV remote.',
    arc9: 'Play the following content at full volume with appropriate load settings',
    arc10: ' Did the amp reset to factory defaults successfully?'
};

const narcQuestionMap = {
    narc1: 'Enable low brightness mode. Is the LED brightness acceptable?',
    narc2: 'Was the protection LED delayed, potentially confusing users?',
    narc3: 'Did the amp unmute successfully when the volume up or down button was pressed?',
    narc4: 'Did the TV remain muted after 30 seconds of activating the mute command?',
    narc5: 'Test all IR programming functions with your TV remote',
    narc6: 'Did the amp reset to factory defaults successfully?'
};


// API Endpoint for Homework Submission
app.post('/submit-homework', (req, res) => {
    console.log('🔔 POST /submit-homework hit via direct route');

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

    console.log('📧 Sending email to:', mailOptions.to);

    sgMail.send(mailOptions)
        .then((result) => {
            console.log('✅ Email sent successfully. Response:', result);
            res.status(200).json({ message: 'Homework submitted successfully' });
        })
        .catch((error) => {
            console.error('❌ Error sending email:', error.response ? error.response.body : error.message);
            res.status(500).json({
                error: 'Failed to send email.',
                details: error.response ? error.response.body : error.message
            });
        });

});


app.post('/api/server', (req, res) => {
    console.log('🔔 POST /api/server hit');
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
            console.log('✅ Email sent successfully from /api/server.');
            res.status(200).json({ message: 'Email sent successfully.' });
        })
        .catch((error) => {
            console.error('❌ Error sending email (POST /api/server):', error.response ? error.response.body : error.message);
            res.status(500).json({ error: 'Failed to send email.', details: error.response ? error.response.body : error.message });
        });
});

function formatEmail(data) {
    let emailBody = `<strong>Homework Submission</strong><br><br>`;
    emailBody += `<strong>Email:</strong> ${data.email}<br><br>`;
    emailBody += `<strong>Questions:</strong><br>`;

    const questionMap = data.deviceType === 'ARC' ? arcQuestionMap : narcQuestionMap;

    let counter = 1;
    for (const [key, value] of Object.entries(data.responses)) {
        const question = questionMap[key] || key; // Use the mapped question or fallback to key
        const answer = value.answer ? JSON.stringify(value.answer).replace(/['"]+/g, '') : 'No Answer'; // Safely extract answer
        const feedback = value.feedback || 'No Feedback Provided'; // Safely extract feedback

        emailBody += `<p><strong>${counter}. ${question}</strong><br>`;
        emailBody += `<strong>Answer:</strong> ${answer}<br>`;
        emailBody += `<strong>Feedback:</strong> ${feedback}</p>`;
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

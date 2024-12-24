const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Test Route
app.get('/', (req, res) => {
    res.send('Server is running.');
});

// Homework Submission Route
app.post('/submit-homework', (req, res) => {
    const formData = req.body;
    console.log('Received form data:', formData);

    res.status(200).json({ message: 'Form submission received!' });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

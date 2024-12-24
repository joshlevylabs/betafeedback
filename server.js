const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Serve static files (like homework.html)
app.use(express.static(path.join(__dirname, '..')));  // Serve from project root

// API Endpoint for Homework Submission
app.post('/submit-homework', (req, res) => {
    const formData = req.body;
    console.log('Received form data:', formData);

    res.status(200).json({ message: 'Homework submitted successfully!' });
});

// Catch-all route for handling 404s
app.get('*', (req, res) => {
    res.status(404).send('Page not found');
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

const pool = require('./db');
require('./db'); // Runs initializeDatabase()
pool.end(() => console.log('Database connection closed'));
const pool = require('./db');
const { initializeDatabase } = require('./db');

(async () => {
  await initializeDatabase();
  pool.end(() => console.log('Database connection closed'));
})();
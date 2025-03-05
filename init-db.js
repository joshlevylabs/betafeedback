const pool = require('./api/db');
const { initializeDatabase } = require('./api/db');

(async () => {
  await initializeDatabase();
  pool.end(() => console.log('Database connection closed'));
})();
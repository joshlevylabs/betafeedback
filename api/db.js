require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// PostgreSQL connection using environment variables
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME, // Relies on .env
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false } // Required for Amazon RDS
  });

// Function to initialize the database
async function initializeDatabase() {
  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        is_admin BOOLEAN DEFAULT FALSE
      )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS session (
          sid VARCHAR NOT NULL PRIMARY KEY,
          sess JSON NOT NULL,
          expire TIMESTAMP(6) NOT NULL
        )
      `);

    // Create groups table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS groups (
        id SERIAL PRIMARY KEY,
        name TEXT,
        description TEXT
      )
    `);

    // Create user_groups table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_groups (
        user_id INTEGER,
        group_id INTEGER,
        PRIMARY KEY (user_id, group_id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (group_id) REFERENCES groups(id)
      )
    `);

    // Create homework_assignments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS homework_assignments (
        id SERIAL PRIMARY KEY,
        title TEXT,
        description TEXT,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);

    // Create user_assignments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_assignments (
        user_id INTEGER,
        assignment_id INTEGER,
        PRIMARY KEY (user_id, assignment_id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (assignment_id) REFERENCES homework_assignments(id)
      )
    `);

    // Create submissions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS submissions (
        id SERIAL PRIMARY KEY,
        assignment_id INTEGER,
        user_id INTEGER,
        content TEXT,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (assignment_id) REFERENCES homework_assignments(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Create assignment_groups table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assignment_groups (
        assignment_id INTEGER,
        group_id INTEGER,
        PRIMARY KEY (assignment_id, group_id),
        FOREIGN KEY (assignment_id) REFERENCES homework_assignments(id),
        FOREIGN KEY (group_id) REFERENCES groups(id)
      )
    `);

    // Create assignment_questions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assignment_questions (
        id SERIAL PRIMARY KEY,
        assignment_id INTEGER,
        context TEXT,
        question TEXT NOT NULL,
        has_yes_no BOOLEAN DEFAULT FALSE,
        yes_no_required BOOLEAN DEFAULT FALSE,
        has_text_input BOOLEAN DEFAULT FALSE,
        text_input_required BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (assignment_id) REFERENCES homework_assignments(id)
      )
    `);

    // Create submission_answers table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS submission_answers (
        id SERIAL PRIMARY KEY,
        submission_id INTEGER,
        question_id INTEGER,
        yes_no_answer BOOLEAN,
        text_answer TEXT,
        FOREIGN KEY (submission_id) REFERENCES submissions(id),
        FOREIGN KEY (question_id) REFERENCES assignment_questions(id)
      )
    `);

    // Add columns to assignment_questions if they don’t exist
    const assignmentQuestionsColumns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'assignment_questions'");
    const hasPhotoPath = assignmentQuestionsColumns.rows.some(row => row.column_name === 'photo_path');
    const hasVideoPath = assignmentQuestionsColumns.rows.some(row => row.column_name === 'video_path');
    if (!hasPhotoPath) await pool.query("ALTER TABLE assignment_questions ADD COLUMN photo_path TEXT");
    if (!hasVideoPath) await pool.query("ALTER TABLE assignment_questions ADD COLUMN video_path TEXT");

    // Add requirements column to homework_assignments if not exists
    const homeworkAssignmentsColumns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'homework_assignments'");
    const hasRequirements = homeworkAssignmentsColumns.rows.some(row => row.column_name === 'requirements');
    if (!hasRequirements) await pool.query("ALTER TABLE homework_assignments ADD COLUMN requirements TEXT");

    // Create group_files table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS group_files (
        id SERIAL PRIMARY KEY,
        group_id INTEGER,
        file_name TEXT,
        file_path TEXT,
        uploaded_by INTEGER,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES groups(id),
        FOREIGN KEY (uploaded_by) REFERENCES users(id)
      )
    `);

    // Create assignment_group_downloads table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assignment_group_downloads (
        assignment_id INTEGER,
        group_id INTEGER,
        file_id INTEGER,
        PRIMARY KEY (assignment_id, group_id, file_id),
        FOREIGN KEY (assignment_id) REFERENCES homework_assignments(id),
        FOREIGN KEY (group_id) REFERENCES groups(id),
        FOREIGN KEY (file_id) REFERENCES group_files(id)
      )
    `);

    // Seed groups if none exist
    const groupCount = await pool.query("SELECT COUNT(*) as count FROM groups");
    if (parseInt(groupCount.rows[0].count) === 0) {
      await pool.query("INSERT INTO groups (name, description) VALUES ('Group A', 'Description A')");
      await pool.query("INSERT INTO groups (name, description) VALUES ('Group B', 'Description B')");
    }

    // Create group_faqs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS group_faqs (
        id SERIAL PRIMARY KEY,
        group_id INTEGER,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES groups(id)
      )
    `);

    // Seed FAQs if none exist
    const faqCount = await pool.query("SELECT COUNT(*) as count FROM group_faqs");
    if (parseInt(faqCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO group_faqs (group_id, question, answer)
        VALUES (1, 'What is Group A about?', 'Group A focuses on testing feature X.')
      `);
      await pool.query(`
        INSERT INTO group_faqs (group_id, question, answer)
        VALUES (2, 'What is Group B about?', 'Group B focuses on testing feature Y.')
      `);
    }

    // Add profile_image column to users if not exists
    const userColumns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'");
    const hasProfileImage = userColumns.rows.some(row => row.column_name === 'profile_image');
    if (!hasProfileImage) {
      await pool.query("ALTER TABLE users ADD COLUMN profile_image TEXT");
      console.log('Added profile_image column to users table');
    }

    // Define users to add
    const usersToAdd = [
      { name: 'Admin User', email: 'admin@example.com', password: 'securepassword', is_admin: true },
      { name: 'Josh Levy', email: 'josh@joshlevylabs.com', password: 'sonance991', is_admin: true },
      { name: 'Joshua L', email: 'joshual@sonance.com', password: 'sonance991', is_admin: true },
      { name: 'Akob', email: 'akob@sonance.com', password: 'sonance991', is_admin: false },
      { name: 'Brian T', email: 'briant@sonance.com', password: 'sonance991', is_admin: false },
      { name: 'Corey', email: 'corey@jamesloudspeaker.com', password: 'sonance991', is_admin: false },
      { name: 'Dale Sandberg', email: 'dale.sandberg@sonance.com', password: 'sonance991', is_admin: false },
      { name: 'Dan Demulling', email: 'dan.demulling@sonance.com', password: 'sonance991', is_admin: false },
      { name: 'David S', email: 'davids@dsonance.com', password: 'sonance991', is_admin: false },
      { name: 'Eric Kiner', email: 'eric.kiner@sonance.com', password: 'sonance991', is_admin: false },
      { name: 'Morgan W', email: 'morganw@sonance.com', password: 'sonance991', is_admin: false },
      { name: 'Nick D', email: 'nickd@sonance.com', password: 'sonance991', is_admin: false },
      { name: 'Scott F', email: 'scottf@sonance.com', password: 'sonance991', is_admin: false },
      { name: 'Jon B', email: 'jonb@sonance.com', password: 'sonance991', is_admin: false },
      { name: 'Josh B', email: 'joshb@sonance.com', password: 'sonance991', is_admin: false },
      { name: 'Steve Bartlett', email: 'steve.bartlett-c@sonance.com', password: 'sonance991', is_admin: false },
    ];

    // In initializeDatabase(), before the users loop
    console.log('Starting user creation process...');

    // Inside the loop, enhance logging
    for (const user of usersToAdd) {
    const existingUser = await pool.query("SELECT * FROM users WHERE email = $1", [user.email]);
    if (existingUser.rows.length === 0) {
        const hashedPassword = await bcrypt.hash(user.password, 10);
        await pool.query(
        "INSERT INTO users (name, email, password, is_admin) VALUES ($1, $2, $3, $4)",
        [user.name, user.email, hashedPassword, user.is_admin]
        );
        console.log(`Successfully added user: ${user.email}`);
    } else {
        console.log(`User already exists in database: ${user.email}`);
    }
    }

    console.log('Database initialization complete.');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

// Initialize the database
initializeDatabase();

// Export the pool for use in other files
module.exports = pool;

pool.connect((err, client, release) => {
    if (err) {
      console.error('Database connection failed:', err);
    } else {
      console.log('Database connected successfully');
      release();
    }
  });
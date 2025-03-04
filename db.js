const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const db = new sqlite3.Database('./users.db');

async function initializeDatabase() {
  // Users table with name column
  await new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        is_admin BOOLEAN DEFAULT 0
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });

  // Groups table
  await new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY,
        name TEXT,
        description TEXT
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });

  // User_groups table (many-to-many relationship)
  await new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS user_groups (
        user_id INTEGER,
        group_id INTEGER,
        PRIMARY KEY (user_id, group_id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (group_id) REFERENCES groups(id)
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });

  // Existing tables: homework_assignments, user_assignments, submissions
  await new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS homework_assignments (
        id INTEGER PRIMARY KEY,
        title TEXT,
        description TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id)
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });

  await new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS user_assignments (
        user_id INTEGER,
        assignment_id INTEGER,
        PRIMARY KEY (user_id, assignment_id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (assignment_id) REFERENCES homework_assignments(id)
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });

  await new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY,
        assignment_id INTEGER,
        user_id INTEGER,
        content TEXT,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (assignment_id) REFERENCES homework_assignments(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });

  // Assignment_groups table
  await new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS assignment_groups (
        assignment_id INTEGER,
        group_id INTEGER,
        PRIMARY KEY (assignment_id, group_id),
        FOREIGN KEY (assignment_id) REFERENCES homework_assignments(id),
        FOREIGN KEY (group_id) REFERENCES groups(id)
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });

  // Assignment_questions table
  await new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS assignment_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        assignment_id INTEGER,
        context TEXT,
        question TEXT NOT NULL,
        has_yes_no BOOLEAN DEFAULT 0,
        yes_no_required BOOLEAN DEFAULT 0,
        has_text_input BOOLEAN DEFAULT 0,
        text_input_required BOOLEAN DEFAULT 0,
        FOREIGN KEY (assignment_id) REFERENCES homework_assignments(id)
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });

  // Submissions table (redefined to avoid duplicate creation)
  await new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        assignment_id INTEGER,
        user_id INTEGER,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (assignment_id) REFERENCES homework_assignments(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });

  // Submission_answers table
  await new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS submission_answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        submission_id INTEGER,
        question_id INTEGER,
        yes_no_answer BOOLEAN,
        text_answer TEXT,
        FOREIGN KEY (submission_id) REFERENCES submissions(id),
        FOREIGN KEY (question_id) REFERENCES assignment_questions(id)
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });

  // Add photo_path and video_path to assignment_questions if not exist
await new Promise((resolve, reject) => {
    db.all("PRAGMA table_info(assignment_questions)", (err, columns) => {
      if (err) return reject(err);
      const hasPhotoPath = columns.some(col => col.name === 'photo_path');
      const hasVideoPath = columns.some(col => col.name === 'video_path');
      if (!hasPhotoPath) {
        db.run("ALTER TABLE assignment_questions ADD COLUMN photo_path TEXT", (err) => {
          if (err) console.error('Error adding photo_path column:', err);
          else console.log('Added photo_path column to assignment_questions');
        });
      }
      if (!hasVideoPath) {
        db.run("ALTER TABLE assignment_questions ADD COLUMN video_path TEXT", (err) => {
          if (err) console.error('Error adding video_path column:', err);
          else console.log('Added video_path column to assignment_questions');
        });
      }
      resolve();
    });
  });

  // Add requirements column to homework_assignments if not exist
await new Promise((resolve, reject) => {
    db.all("PRAGMA table_info(homework_assignments)", (err, columns) => {
      if (err) return reject(err);
      const hasRequirements = columns.some(col => col.name === 'requirements');
      if (!hasRequirements) {
        db.run("ALTER TABLE homework_assignments ADD COLUMN requirements TEXT", (err) => {
          if (err) console.error('Error adding requirements column:', err);
          else console.log('Added requirements column to homework_assignments');
        });
      }
      resolve();
    });
  });

  // Group_files table
  await new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS group_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER,
        file_name TEXT,
        file_path TEXT,
        uploaded_by INTEGER,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES groups(id),
        FOREIGN KEY (uploaded_by) REFERENCES users(id)
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });

// assignment_group_downloads
await new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS assignment_group_downloads (
        assignment_id INTEGER,
        group_id INTEGER,
        file_id INTEGER,
        PRIMARY KEY (assignment_id, group_id, file_id),
        FOREIGN KEY (assignment_id) REFERENCES homework_assignments(id),
        FOREIGN KEY (group_id) REFERENCES groups(id),
        FOREIGN KEY (file_id) REFERENCES group_files(id)
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });

  // Seed some groups if none exist
  db.get("SELECT COUNT(*) as count FROM groups", [], (err, row) => {
    if (!err && row.count === 0) {
      db.run("INSERT INTO groups (name, description) VALUES ('Group A', 'Description A')");
      db.run("INSERT INTO groups (name, description) VALUES ('Group B', 'Description B')");
    }
  });
  
  // Group_faqs table
  await new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS group_faqs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES groups(id)
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });

  // Seed some FAQs if none exist (optional, for testing)
  db.get("SELECT COUNT(*) as count FROM group_faqs", [], (err, row) => {
    if (!err && row.count === 0) {
      db.run(`
        INSERT INTO group_faqs (group_id, question, answer) 
        VALUES (1, 'What is Group A about?', 'Group A focuses on testing feature X.')
      `);
      db.run(`
        INSERT INTO group_faqs (group_id, question, answer) 
        VALUES (2, 'What is Group B about?', 'Group B focuses on testing feature Y.')
      `);
    }
  });

  // Check if profile_image column exists before adding it
  const columns = await new Promise((resolve, reject) => {
    db.all("PRAGMA table_info(users)", (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  const hasProfileImageColumn = columns.some(col => col.name === 'profile_image');
  if (!hasProfileImageColumn) {
    await new Promise((resolve, reject) => {
      db.run(
        `ALTER TABLE users ADD COLUMN profile_image TEXT`,
        (err) => (err ? reject(err) : resolve())
      );
    });
    console.log('Added profile_image column to users table');
  } else {
    console.log('profile_image column already exists in users table');
  }

  // Define users to add (with names)
  const usersToAdd = [
    { name: 'Admin User', email: 'admin@example.com', password: 'securepassword', is_admin: 1 },
    { name: 'Josh Levy', email: 'josh@joshlevylabs.com', password: 'sonance991', is_admin: 1 },
    { name: 'Joshua L', email: 'joshual@sonance.com', password: 'sonance991', is_admin: 1 },
    { name: 'Akob', email: 'akob@sonance.com', password: 'sonance991', is_admin: 0 },
    { name: 'Brian T', email: 'briant@sonance.com', password: 'sonance991', is_admin: 0 },
    { name: 'Corey', email: 'corey@jamesloudspeaker.com', password: 'sonance991', is_admin: 0 },
    { name: 'Dale Sandberg', email: 'dale.sandberg@sonance.com', password: 'sonance991', is_admin: 0 },
    { name: 'Dan Demulling', email: 'dan.demulling@sonance.com', password: 'sonance991', is_admin: 0 },
    { name: 'David S', email: 'davids@dsonance.com', password: 'sonance991', is_admin: 0 },
    { name: 'Eric Kiner', email: 'eric.kiner@sonance.com', password: 'sonance991', is_admin: 0 },
    { name: 'Morgan W', email: 'morganw@sonance.com', password: 'sonance991', is_admin: 0 },
    { name: 'Nick D', email: 'nickd@sonance.com', password: 'sonance991', is_admin: 0 },
    { name: 'Scott F', email: 'scottf@sonance.com', password: 'sonance991', is_admin: 0 },
    { name: 'Jon B', email: 'jonb@sonance.com', password: 'sonance991', is_admin: 0 },
    { name: 'Josh B', email: 'joshb@sonance.com', password: 'sonance991', is_admin: 0 },
    { name: 'Steve Bartlett', email: 'steve.bartlett-c@sonance.com', password: 'sonance991', is_admin: 0 },
  ];

  // Add users if they don’t exist
  for (const user of usersToAdd) {
    const existingUser = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE email = ?', [user.email], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    if (!existingUser) {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO users (name, email, password, is_admin) VALUES (?, ?, ?, ?)',
          [user.name, user.email, hashedPassword, user.is_admin],
          (err) => (err ? reject(err) : resolve())
        );
      });
      console.log(`Added user: ${user.email}`);
    } else {
      console.log(`User already exists: ${user.email}`);
    }
  }
}

initializeDatabase()
  .then(() => console.log('Database initialization complete.'))
  .catch((err) => console.error('Error initializing database:', err));

module.exports = db;
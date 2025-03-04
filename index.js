require('dotenv').config();
const express = require('express');
const session = require('express-session');
const db = require('./db');
const bcrypt = require('bcrypt');
const app = express();
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer');
const sendgridTransport = require('nodemailer-sendgrid-transport');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'your-session-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

app.use(express.static('public'));
app.set('view engine', 'ejs');

// Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'public/uploads');
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname)); // Unique filename with timestamp
    }
  });
  
  const upload = multer({ storage: storage });

// Configure Nodemailer to use SendGrid
const transporter = nodemailer.createTransport(sendgridTransport({
    auth: {
      api_key: process.env.SENDGRID_API_KEY
    }
  }));

  // Function to send emails to group members
  function sendAssignmentEmails(assignmentId, groupIds, assignmentTitle) {
    const groupPlaceholders = groupIds.map(() => '?').join(',');
    db.all(
      `SELECT DISTINCT u.email, u.name, ug.group_id
       FROM users u
       JOIN user_groups ug ON u.id = ug.user_id
       WHERE ug.group_id IN (${groupPlaceholders})`,
      groupIds,
      (err, users) => {
        if (err) {
          console.error('Error fetching users for email notification:', err);
          return;
        }
        users.forEach(user => {
          const assignmentLink = `http://localhost:3000/assignment/${assignmentId}/group/${user.group_id}`;
          const mailOptions = {
            from: 'sonance991@gmail.com',
            to: user.email,
            subject: `New Homework Assignment: ${assignmentTitle}`,
            html: `<p>Dear ${user.name},</p>
                   <p>You have been assigned a new homework assignment: <strong>${assignmentTitle}</strong>.</p>
                   <p>Click <a href="${assignmentLink}">here</a> to view and complete the assignment.</p>
                   <p>Best regards,<br>Your Application Team</p>`
          };
          transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
              console.error(`Error sending email to ${user.email}:`, error);
            } else {
              console.log(`Email sent to ${user.email}:`, info.response);
            }
          });
        });
      }
    );
  }

// Initial admin account setup
const adminEmail = 'admin@example.com';
const adminPassword = 'securepassword';
db.get("SELECT * FROM users WHERE email = ?", [adminEmail], async (err, user) => {
  if (!user) {
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    db.run("INSERT INTO users (name, email, password, is_admin) VALUES (?, ?, ?, 1)", 
      ['Admin User', adminEmail, hashedPassword], 
      (err) => {
        if (err) console.error('Error creating admin:', err);
        else console.log('Admin user created');
      }
    );
  }
});



// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
      db.get("SELECT * FROM users WHERE id = ?", [req.session.userId], (err, user) => {
        if (err || !user) {
          return res.redirect('/');
        }
        req.user = user;
        next();
      });
    } else {
      res.redirect('/');
    }
  }
  
  // Middleware to check if user is an admin
  function isAdmin(req, res, next) {
    if (req.user && req.user.is_admin) {
      next();
    } else {
      res.status(403).send('Forbidden');
    }
  }

// Admin endpoint to add a new user
app.post('/admin/users', isAdmin, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).send('Email and password are required');
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  db.run("INSERT INTO users (email, password) VALUES (?, ?)", 
    [email, hashedPassword], 
    function(err) {
      if (err) {
        return res.status(400).send('Error creating user');
      }
      res.status(201).send('User created');
    }
  );
});

// Serve login and home pages
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
  });
  
  app.get('/home', isAuthenticated, (req, res) => {
    res.sendFile(__dirname + '/public/home.html');
  });

// Login endpoint using email
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
      if (err || !user) {
        return res.status(400).send('Invalid credentials');
      }
      const match = await bcrypt.compare(password, user.password);
      if (match) {
        req.session.userId = user.id;
        res.redirect('/dashboard');
      } else {
        res.status(400).send('Invalid credentials');
      }
    });
  });
  
  // Logout endpoint
  app.post('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
  });
  
  // Dashboard (updated to include groups)
  app.get('/dashboard', isAuthenticated, (req, res) => {
    db.all(
      `SELECT g.* FROM groups g
       JOIN user_groups ug ON g.id = ug.group_id
       WHERE ug.user_id = ?`,
      [req.user.id],
      (err, groups) => {
        if (err) {
          console.error('Error fetching groups:', err);
          return res.status(500).send('Error fetching groups');
        }
        db.all(
          `SELECT ha.*, s.id as submission_id, g.name as group_name
           FROM homework_assignments ha
           JOIN assignment_groups ag ON ha.id = ag.assignment_id
           JOIN user_groups ug ON ag.group_id = ug.group_id
           JOIN groups g ON ag.group_id = g.id
           LEFT JOIN submissions s ON ha.id = s.assignment_id AND s.user_id = ?
           WHERE ug.user_id = ?
           ORDER BY ha.created_at DESC`,
          [req.user.id, req.user.id],
          (err, assignments) => {
            if (err) {
              console.error('Error fetching assignments:', err);
              return res.status(500).send('Error fetching assignments');
            }
            const submitted = assignments.filter(a => a.submission_id);
            const unsubmitted = assignments.filter(a => !a.submission_id);
            res.render('dashboard', {
              user: req.user,
              groups: groups || [],
              submitted: submitted || [],
              unsubmitted: unsubmitted || []
            });
          }
        );
      }
    );
  });

  // Profile edit routes
app.get('/profile/edit', isAuthenticated, (req, res) => {
    res.render('edit-profile', { user: req.user });
  });
  
  app.post('/profile/edit', isAuthenticated, upload.single('profile_image'), async (req, res) => {
    const { name, email, password, icon } = req.body;
    let profileImage = req.user.profile_image;
  
    if (req.file) {
      profileImage = '/uploads/' + req.file.filename;
    } else if (icon) {
      profileImage = '/icons/' + icon;
    }
  
    let updateFields = [name, email, profileImage];
    let sql = "UPDATE users SET name = ?, email = ?, profile_image = ?";
  
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      sql += ", password = ?";
      updateFields.push(hashedPassword);
    }
  
    sql += " WHERE id = ?";
    updateFields.push(req.user.id);
  
    db.run(sql, updateFields, (err) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).send('Error updating profile: ' + err.message);
      }
      // Update session user data
      req.user.name = name;
      req.user.email = email;
      req.user.profile_image = profileImage;
      res.redirect('/dashboard');
    });
  });

  // Admin user management routes
  app.get('/admin/users', isAuthenticated, isAdmin, (req, res) => {
    const search = req.query.search || ''; // Get search term from query, default to empty string
    let sql = "SELECT * FROM users";
    let params = [];
    
    // If a search term is provided, add a WHERE clause to filter users
    if (search) {
      sql += " WHERE name LIKE ? OR email LIKE ?";
      params = [`%${search}%`, `%${search}%`];
    }
    
    db.all(sql, params, (err, users) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error fetching users');
      }
      // Pass the search variable along with user and users to the template
      res.render('admin-users', { user: req.user, users: users, search: search });
    });
  });
  
  app.get('/admin/users/add', isAuthenticated, isAdmin, (req, res) => {
    res.render('add-user', { user: req.user });
  });
  
  app.post('/admin/users/add', isAuthenticated, isAdmin, async (req, res) => {
    const { name, email, password, is_admin } = req.body;
    if (!name || !email || !password) {
      return res.status(400).send('Name, email, and password are required');
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(
      "INSERT INTO users (name, email, password, is_admin) VALUES (?, ?, ?, ?)",
      [name, email, hashedPassword, is_admin ? 1 : 0],
      function(err) {
        if (err) return res.status(500).send('Error adding user');
        res.redirect('/admin/users');
      }
    );
  });
  
  app.get('/admin/users/edit/:id', isAuthenticated, isAdmin, (req, res) => {
    const userId = req.params.id;
    db.get("SELECT * FROM users WHERE id = ?", [userId], (err, editUser) => {
      if (err || !editUser) return res.status(404).send('User not found');
      res.render('edit-user', { user: req.user, editUser: editUser });
    });
  });
  
  app.post('/admin/users/edit/:id', isAuthenticated, isAdmin, async (req, res) => {
    const userId = req.params.id;
    const { name, email, password, is_admin } = req.body;
  
    // Step 1: Check if the user exists
    db.get("SELECT * FROM users WHERE id = ?", [userId], async (err, editUser) => {
      if (err) {
        return res.status(500).send('Error fetching user: ' + err.message);
      }
      if (!editUser) {
        return res.status(404).send('User not found');
      }
  
      // Step 2: Check for duplicate email
      db.get("SELECT * FROM users WHERE email = ? AND id != ?", [email, userId], async (err, existing) => {
        if (err) {
          return res.status(500).send('Error checking email: ' + err.message);
        }
        if (existing) {
          return res.status(400).send('Email already in use');
        }
  
        // Step 3: Prepare the update query
        let updateFields = [name, email, is_admin ? 1 : 0];
        let sql = "UPDATE users SET name = ?, email = ?, is_admin = ?";
  
        // If a new password is provided, hash it and include in the update
        if (password) {
          const hashedPassword = await bcrypt.hash(password, 10);
          sql += ", password = ?";
          updateFields.push(hashedPassword);
        }
  
        sql += " WHERE id = ?";
        updateFields.push(userId);
  
        // Step 4: Log for debugging
        console.log('SQL:', sql);
        console.log('Fields:', updateFields);
  
        // Step 5: Execute the update
        db.run(sql, updateFields, (err) => {
          if (err) {
            return res.status(500).send('Error updating user: ' + err.message);
          }
          res.redirect('/admin/users');
        });
      });
    });
  });

  app.post('/admin/users/delete/:id', isAuthenticated, isAdmin, (req, res) => {
    const userId = req.params.id;
    db.run("DELETE FROM users WHERE id = ?", [userId], (err) => {
      if (err) return res.status(500).send('Error deleting user');
      res.redirect('/admin/users');
    });
  });
  
  app.get('/admin/users/groups/:id', isAuthenticated, isAdmin, (req, res) => {
    const userId = req.params.id;
    db.get("SELECT * FROM users WHERE id = ?", [userId], (err, editUser) => {
      if (err || !editUser) return res.status(404).send('User not found');
      db.all(
        "SELECT g.id, g.name, ug.user_id IS NOT NULL as is_member FROM groups g LEFT JOIN user_groups ug ON g.id = ug.group_id AND ug.user_id = ?",
        [userId],
        (err, groups) => {
          if (err) return res.status(500).send('Error fetching groups');
          res.render('user-groups', { user: req.user, editUser: editUser, groups: groups });
        }
      );
    });
  });
  
  app.post('/admin/users/groups/:id', isAuthenticated, isAdmin, (req, res) => {
    const userId = req.params.id;
    const groupIds = req.body.groupIds || [];
    db.run("DELETE FROM user_groups WHERE user_id = ?", [userId], (err) => {
      if (err) return res.status(500).send('Error updating groups');
      const stmt = db.prepare("INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)");
      groupIds.forEach(groupId => {
        stmt.run(userId, groupId);
      });
      stmt.finalize(() => res.redirect('/admin/users'));
    });
  });

  // Group management routes
  app.get('/admin/groups', isAuthenticated, isAdmin, (req, res) => {
    const search = req.query.search || '';
    let sql = "SELECT * FROM groups";
    let params = [];
  
    if (search) {
      sql += " WHERE name LIKE ? OR description LIKE ?";
      params = [`%${search}%`, `%${search}%`];
    }
  
    db.all(sql, params, (err, groups) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error fetching groups');
      }
      res.render('admin-groups', { user: req.user, groups: groups, search: search });
    });
  });
  
  app.get('/admin/groups/add', isAuthenticated, isAdmin, (req, res) => {
    res.render('add-group', { user: req.user });
  });
  
  app.post('/admin/groups/add', isAuthenticated, isAdmin, (req, res) => {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).send('Group name is required');
    }
    db.run(
      "INSERT INTO groups (name, description) VALUES (?, ?)",
      [name, description || ''],
      function (err) {
        if (err) return res.status(500).send('Error adding group');
        res.redirect('/admin/groups');
      }
    );
  });
  
  app.get('/admin/groups/edit/:id', isAuthenticated, isAdmin, (req, res) => {
    const groupId = req.params.id;
    db.get("SELECT * FROM groups WHERE id = ?", [groupId], (err, group) => {
      if (err || !group) return res.status(404).send('Group not found');
      res.render('edit-group', { user: req.user, group: group });
    });
  });
  
  app.post('/admin/groups/edit/:id', isAuthenticated, isAdmin, (req, res) => {
    const groupId = req.params.id;
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).send('Group name is required');
    }
    db.run(
      "UPDATE groups SET name = ?, description = ? WHERE id = ?",
      [name, description || '', groupId],
      function (err) {
        if (err) return res.status(500).send('Error updating group');
        res.redirect('/admin/groups');
      }
    );
  });
  
  app.post('/admin/groups/delete/:id', isAuthenticated, isAdmin, (req, res) => {
    const groupId = req.params.id;
    // First, remove group assignments from user_groups
    db.run("DELETE FROM user_groups WHERE group_id = ?", [groupId], (err) => {
      if (err) return res.status(500).send('Error deleting group assignments');
      // Then, delete the group
      db.run("DELETE FROM groups WHERE id = ?", [groupId], (err) => {
        if (err) return res.status(500).send('Error deleting group');
        res.redirect('/admin/groups');
      });
    });
  });

  app.get('/admin/groups/manage-users/:id', isAuthenticated, isAdmin, (req, res) => {
    const groupId = req.params.id;
  
    // Fetch the group details
    db.get("SELECT * FROM groups WHERE id = ?", [groupId], (err, group) => {
      if (err || !group) {
        return res.status(404).send('Group not found');
      }
  
      // Fetch all users and their membership status in this group
      db.all(
        "SELECT u.id, u.name, u.profile_image, ug.group_id IS NOT NULL as is_member " +
        "FROM users u LEFT JOIN user_groups ug ON u.id = ug.user_id AND ug.group_id = ?",
        [groupId],
        (err, users) => {
          if (err) {
            return res.status(500).send('Error fetching users');
          }
          res.render('manage-group-users', { user: req.user, group: group, users: users });
        }
      );
    });
  });

  app.post('/admin/groups/manage-users/:id', isAuthenticated, isAdmin, (req, res) => {
    const groupId = req.params.id;
    const userIds = req.body.userIds || []; // Array of selected user IDs (empty if none selected)
  
    // Remove all existing user-group relationships for this group
    db.run("DELETE FROM user_groups WHERE group_id = ?", [groupId], (err) => {
      if (err) {
        return res.status(500).send('Error updating user groups');
      }
  
      // Insert new relationships for selected users
      const stmt = db.prepare("INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)");
      userIds.forEach(userId => {
        stmt.run(userId, groupId);
      });
  
      // Finalize the statement and redirect back to the groups page
      stmt.finalize(() => res.redirect('/admin/groups'));
    });
  });

  app.get('/groups/:id', isAuthenticated, (req, res) => {
    const groupId = req.params.id;
    const userId = req.user.id;
  
    // Fetch group details
    db.get("SELECT * FROM groups WHERE id = ?", [groupId], (err, group) => {
      if (err || !group) {
        return res.status(404).send('Group not found');
      }
  
      // Fetch group members with profile_image
      db.all(
        `SELECT u.id, u.name, u.profile_image FROM users u
         JOIN user_groups ug ON u.id = ug.user_id
         WHERE ug.group_id = ?`,
        [groupId],
        (err, members) => {
          if (err) {
            return res.status(500).send('Error fetching group members');
          }
  
          // Fetch homework assignments for the group
          db.all(
            `SELECT ha.* FROM homework_assignments ha
             JOIN assignment_groups ag ON ha.id = ag.assignment_id
             WHERE ag.group_id = ?`,
            [groupId],
            (err, assignments) => {
              if (err) {
                console.error('Error fetching assignments:', err);
                return res.status(500).send('Error fetching assignments');
              }
  
              // Fetch user's submissions for these assignments
              db.all(
                `SELECT s.* FROM submissions s
                 WHERE s.user_id = ? AND s.assignment_id IN (
                   SELECT assignment_id FROM assignment_groups WHERE group_id = ?
                 )`,
                [userId, groupId],
                (err, submissions) => {
                  if (err) {
                    console.error('Error fetching submissions:', err);
                    return res.status(500).send('Error fetching submissions');
                  }
  
                  // Calculate outstanding assignments
                  const submittedAssignmentIds = submissions.map(s => s.assignment_id);
                  const outstandingAssignments = assignments.filter(
                    a => !submittedAssignmentIds.includes(a.id)
                  );
  
                  // Render the group details page
                  res.render('group-details', {
                    user: req.user,
                    group: group,
                    members: members,
                    assignments: assignments,
                    submissions: submissions,
                    outstandingAssignments: outstandingAssignments
                  });
                }
              );
            }
          );
        }
      );
    });
  });

  // GET: Render create assignment form
app.get('/create-assignment', isAuthenticated, isAdmin, (req, res) => {
    db.all("SELECT * FROM groups", [], (err, groups) => {
      if (err) return res.status(500).send('Error fetching groups');
      res.render('create-assignment', { user: req.user, groups });
    });
  });
  
  // Temporary storage for uploaded files (in-memory; consider a DB for production)
const uploadedFiles = new Map(); // Key: unique ID, Value: { path, type }

// Upload photo endpoint
app.post('/upload-photo', isAuthenticated, isAdmin, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const fileId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  uploadedFiles.set(fileId, { path: '/uploads/' + req.file.filename, type: 'photo' });
  res.json({ fileId, path: '/uploads/' + req.file.filename });
});

// Upload video endpoint
app.post('/upload-video', isAuthenticated, isAdmin, upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const fileId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  uploadedFiles.set(fileId, { path: '/uploads/' + req.file.filename, type: 'video' });
  res.json({ fileId, path: '/uploads/' + req.file.filename });
});

// Delete file endpoint
app.post('/delete-file', isAuthenticated, isAdmin, (req, res) => {
  const { fileId } = req.body;
  if (uploadedFiles.has(fileId)) {
    const file = uploadedFiles.get(fileId);
    const fs = require('fs');
    const filePath = path.join(__dirname, 'public', file.path);
    fs.unlink(filePath, (err) => {
      if (err) console.error('Error deleting file:', err);
    });
    uploadedFiles.delete(fileId);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

  // POST: Handle assignment creation
// POST: Handle assignment creation
app.post('/create-assignment', isAuthenticated, isAdmin, (req, res, next) => {
    next();
  }, (req, res) => {
    const { title, description, requirements, groupIds, context, question, hasYesNo, yesNoRequired, hasTextInput, textInputRequired, photoPaths = [], videoPaths = [], relatedDownloads } = req.body;
    
    if (!groupIds || groupIds.length === 0) {
      return res.status(400).send('At least one group must be selected');
    }
  
    db.run(
      'INSERT INTO homework_assignments (title, description, requirements, created_by) VALUES (?, ?, ?, ?)',
      [title, description, requirements || null, req.user.id],
      function (err) {
        if (err) return res.status(500).send('Error creating assignment');
        const assignmentId = this.lastID;
  
        const groupStmt = db.prepare("INSERT INTO assignment_groups (assignment_id, group_id) VALUES (?, ?)");
        groupIds.forEach(groupId => groupStmt.run(assignmentId, groupId));
        groupStmt.finalize();
  
        // Save related downloads per group
        if (relatedDownloads && Array.isArray(relatedDownloads)) {
          const downloadStmt = db.prepare("INSERT OR IGNORE INTO assignment_group_downloads (assignment_id, group_id, file_id) VALUES (?, ?, ?)");
          groupIds.forEach((groupId, index) => {
            const fileIds = relatedDownloads[index] || []; // Get file IDs for this group
            fileIds.forEach(fileId => {
              downloadStmt.run(assignmentId, groupId, fileId);
            });
          });
          downloadStmt.finalize();
          console.log('relatedDownloads from form:', relatedDownloads);
        }
  
        // Rest of the code (questions, email notifications, etc.) remains unchanged
        if (question && Array.isArray(question) && question.length > 0) {
          const questionStmt = db.prepare(
            `INSERT INTO assignment_questions (
              assignment_id, context, question, has_yes_no, yes_no_required, has_text_input, text_input_required, photo_path, video_path
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );
          for (let i = 0; i < question.length; i++) {
            const qPhotoPaths = Array.isArray(photoPaths[i]) ? photoPaths[i] : (photoPaths[i] ? [photoPaths[i]] : []);
            const qVideoPaths = Array.isArray(videoPaths[i]) ? videoPaths[i] : (videoPaths[i] ? [videoPaths[i]] : []);
            const photoPath = qPhotoPaths.length > 0 ? qPhotoPaths.join(',') : null;
            const videoPath = qVideoPaths.length > 0 ? qVideoPaths.join(',') : null;
            questionStmt.run(
              assignmentId,
              context && context[i] ? context[i] : null,
              question[i],
              hasYesNo && hasYesNo[i] ? 1 : 0,
              yesNoRequired && yesNoRequired[i] ? 1 : 0,
              hasTextInput && hasTextInput[i] ? 1 : 0,
              textInputRequired && textInputRequired[i] ? 1 : 0,
              photoPath,
              videoPath
            );
          }
          questionStmt.finalize(err => {
            if (err) return res.status(500).send('Error finalizing questions');
            sendAssignmentEmails(assignmentId, groupIds, title);
            res.redirect('/assignments');
          });
        } else {
          sendAssignmentEmails(assignmentId, groupIds, title);
          res.redirect('/assignments');
        }
      }
    );
  });

// Delete assignment route
app.post('/admin/assignments/delete/:id', isAuthenticated, isAdmin, (req, res) => {
    const assignmentId = req.params.id;
  
    // Start a transaction to ensure all deletions are successful
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
  
      // Delete from assignment_groups
      db.run('DELETE FROM assignment_groups WHERE assignment_id = ?', [assignmentId], (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).send('Error deleting assignment groups');
        }
  
        // Delete from assignment_questions
        db.run('DELETE FROM assignment_questions WHERE assignment_id = ?', [assignmentId], (err) => {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).send('Error deleting assignment questions');
          }
  
          // Delete from submissions
          db.run('DELETE FROM submissions WHERE assignment_id = ?', [assignmentId], (err) => {
            if (err) {
              db.run('ROLLBACK');
              return res.status(500).send('Error deleting submissions');
            }
  
            // Finally, delete the assignment itself
            db.run('DELETE FROM homework_assignments WHERE id = ?', [assignmentId], (err) => {
              if (err) {
                db.run('ROLLBACK');
                return res.status(500).send('Error deleting assignment');
              }
  
              db.run('COMMIT', (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return res.status(500).send('Error completing deletion');
                }
                res.redirect('/admin/assignments');
              });
            });
          });
        });
      });
    });
  });
  
  // Feedback
  app.get('/feedback', isAuthenticated, (req, res) => {
    res.render('feedback', { user: req.user });
  });
  
  app.get('/assignments', isAuthenticated, (req, res) => {
    db.all(
      `SELECT ha.*, ag.group_id, s.id as submission_id, g.name as group_name
       FROM homework_assignments ha
       JOIN assignment_groups ag ON ha.id = ag.assignment_id
       JOIN user_groups ug ON ag.group_id = ug.group_id
       JOIN groups g ON ag.group_id = g.id
       LEFT JOIN submissions s ON ha.id = s.assignment_id AND s.user_id = ?
       WHERE ug.user_id = ?
       ORDER BY ha.created_at DESC`,
      [req.user.id, req.user.id],
      (err, assignments) => {
        if (err) return res.status(500).send('Error fetching assignments');
        const completed = assignments.filter(a => a.submission_id);
        const uncompleted = assignments.filter(a => !a.submission_id);
        res.render('assignments', { user: req.user, completed, uncompleted });
      }
    );
  });
  
  app.post('/submit-assignment', isAuthenticated, (req, res) => {
  console.log('Received form data:', req.body);
  const { assignmentId, yesNo = [], textAnswer = [] } = req.body;

  db.get(
    'SELECT id FROM submissions WHERE assignment_id = ? AND user_id = ?',
    [assignmentId, req.user.id],
    (err, existingSubmission) => {
      if (err) {
        console.error('Error checking existing submission:', err);
        return res.status(500).send('Error checking submission');
      }
      if (existingSubmission) {
        return res.status(400).send('You have already submitted this assignment');
      }

      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        db.run(
          'INSERT INTO submissions (assignment_id, user_id) VALUES (?, ?)',
          [assignmentId, req.user.id],
          function (err) {
            if (err) {
              console.error('Error inserting into submissions:', err);
              db.run('ROLLBACK');
              return res.status(500).send('Error creating submission');
            }

            const submissionId = this.lastID;
            console.log('Inserted submission with ID:', submissionId);

            // Fetch questions in order
            db.all(
              'SELECT id FROM assignment_questions WHERE assignment_id = ? ORDER BY id',
              [assignmentId],
              (err, questions) => {
                if (err) {
                  console.error('Error fetching questions:', err);
                  db.run('ROLLBACK');
                  return res.status(500).send('Error fetching questions');
                }

                const stmt = db.prepare(
                  'INSERT INTO submission_answers (submission_id, question_id, yes_no_answer, text_answer) VALUES (?, ?, ?, ?)'
                );

                questions.forEach((question, index) => {
                  const questionId = question.id;
                  const yesNoValue = yesNo[index] === 'yes' ? 1 : yesNo[index] === 'no' ? 0 : null;
                  const textValue = textAnswer[index] || null;
                  console.log(`Inserting for question ${questionId}: yesNo=${yesNoValue}, text=${textValue}`);
                  stmt.run(submissionId, questionId, yesNoValue, textValue, (err) => {
                    if (err) {
                      console.error('Error inserting answer for question ID', questionId, ':', err);
                    }
                  });
                });

                stmt.finalize((err) => {
                  if (err) {
                    console.error('Error finalizing statement:', err);
                    db.run('ROLLBACK');
                    return res.status(500).send('Error saving answers');
                  }

                  db.run('COMMIT', (err) => {
                    if (err) {
                      console.error('Error committing transaction:', err);
                      db.run('ROLLBACK');
                      return res.status(500).send('Error completing submission');
                    }
                    res.redirect('/assignments');
                  });
                });
              }
            );
          }
        );
      });
    }
  );
});
  
app.get('/assignment/:id', isAuthenticated, (req, res) => {
    const assignmentId = req.params.id;
    const userId = req.user.id;
  
    // Find the first group the user belongs to for this assignment
    db.get(
      `SELECT ag.group_id
       FROM assignment_groups ag
       JOIN user_groups ug ON ag.group_id = ug.group_id
       WHERE ag.assignment_id = ? AND ug.user_id = ?
       LIMIT 1`,
      [assignmentId, userId],
      (err, row) => {
        if (err || !row) {
          return res.status(404).send('Assignment or group not found for this user');
        }
        res.redirect(`/assignment/${assignmentId}/group/${row.group_id}`);
      }
    );
  });
  
  app.get('/assignment/:assignmentId/group/:groupId', isAuthenticated, (req, res) => {
    const { assignmentId, groupId } = req.params;
    const userId = req.user.id;
  
    // Verify user is in the group
    db.get(
      `SELECT * FROM user_groups WHERE user_id = ? AND group_id = ?`,
      [userId, groupId],
      (err, userGroup) => {
        if (err || !userGroup) return res.status(403).send('You do not have access to this assignment for this group');
  
        // Fetch assignment details
        db.get('SELECT * FROM homework_assignments WHERE id = ?', [assignmentId], (err, assignment) => {
          if (err || !assignment) return res.status(404).send('Assignment not found');
  
          // Fetch questions
          db.all('SELECT * FROM assignment_questions WHERE assignment_id = ?', [assignmentId], (err, questions) => {
            if (err) return res.status(500).send('Error fetching questions');
  
            // Fetch related downloads for this group
            db.all(
              `SELECT gf.* FROM group_files gf
               JOIN assignment_group_downloads agd ON gf.id = agd.file_id
               WHERE agd.assignment_id = ? AND agd.group_id = ?`,
              [assignmentId, groupId],
              (err, relatedDownloads) => {
                if (err) return res.status(500).send('Error fetching related downloads');
                console.log('Fetched relatedDownloads:', relatedDownloads); // Add this log
  
                // Check submission
                db.get(
                  'SELECT * FROM submissions WHERE assignment_id = ? AND user_id = ?',
                  [assignmentId, userId],
                  (err, submission) => {
                    if (err) return res.status(500).send('Error checking submission');
                    res.render('assignment', {
                      user: req.user,
                      assignment,
                      questions,
                      relatedDownloads,
                      groupId,
                      hasSubmitted: !!submission
                    });
                  }
                );
              }
            );
          });
        });
      }
    );
  });

  app.get('/downloads', isAuthenticated, (req, res) => {
    const userId = req.user.id;
    const isAdmin = req.user.is_admin;
  
    // Determine which groups to fetch
    let groupQuery;
    if (isAdmin) {
      groupQuery = 'SELECT * FROM groups';
    } else {
      groupQuery = 'SELECT g.* FROM groups g JOIN user_groups ug ON g.id = ug.group_id WHERE ug.user_id = ?';
    }
  
    db.all(groupQuery, isAdmin ? [] : [userId], (err, groups) => {
      if (err) {
        console.error('Error fetching groups:', err);
        return res.status(500).send('Error fetching groups');
      }
  
      // Fetch files for each group, including is_link
      const groupIds = groups.map(g => g.id);
      const filePromises = groupIds.map(groupId =>
        new Promise((resolve, reject) => {
          db.all('SELECT id, file_name, file_path, is_link FROM group_files WHERE group_id = ?', [groupId], (err, files) => {
            if (err) reject(err);
            else resolve({ groupId, files });
          });
        })
      );
  
      Promise.all(filePromises)
        .then(results => {
          const groupsWithFiles = groups.map(group => {
            const groupFiles = results.find(r => r.groupId === group.id)?.files || [];
            return { ...group, files: groupFiles };
          });
          res.render('downloads', { user: req.user, groups: groupsWithFiles });
        })
        .catch(err => {
          console.error('Error fetching files:', err);
          res.status(500).send('Error fetching files');
        });
    });
  });

  app.post('/admin/groups/:id/upload', isAuthenticated, isAdmin, upload.single('file'), (req, res) => {
  const groupId = req.params.id;
  const file = req.file;

  if (!file) {
    return res.status(400).send('No file uploaded');
  }

  const fileName = file.originalname;
  const filePath = '/uploads/' + file.filename;

  db.run(
    'INSERT INTO group_files (group_id, file_name, file_path, uploaded_by, is_link) VALUES (?, ?, ?, ?, 0)',
    [groupId, fileName, filePath, req.user.id],
    (err) => {
      if (err) {
        console.error('Error uploading file:', err);
        return res.status(500).send('Error uploading file');
      }
      res.redirect('/downloads');
    }
  );
});

app.get('/api/downloads', isAuthenticated, (req, res) => {
    const groupIds = req.query.groupIds ? req.query.groupIds.split(',') : [];
    if (groupIds.length === 0) {
      return res.json([]);
    }
    db.all(
      `SELECT gf.id, gf.file_name, gf.group_id, g.name as group_name
       FROM group_files gf
       JOIN groups g ON gf.group_id = g.id
       WHERE gf.group_id IN (${groupIds.map(() => '?').join(',')})`,
      groupIds,
      (err, downloads) => {
        if (err) return res.status(500).json([]);
        res.json(downloads);
      }
    );
  });

  // Route to add a download link
app.post('/admin/groups/:id/add-link', isAuthenticated, isAdmin, (req, res) => {
    const groupId = req.params.id;
    const { title, link } = req.body;
  
    if (!title || !link) {
      return res.status(400).send('Title and link are required');
    }
  
    db.run(
      'INSERT INTO group_files (group_id, file_name, file_path, uploaded_by, is_link) VALUES (?, ?, ?, ?, 1)',
      [groupId, title, link, req.user.id],
      (err) => {
        if (err) {
          console.error('Error adding link:', err);
          return res.status(500).send('Error adding link');
        }
        res.redirect('/downloads');
      }
    );
  });

// FAQs route
app.get('/faqs', isAuthenticated, (req, res) => {
    db.all(
      `SELECT g.* FROM groups g
       JOIN user_groups ug ON g.id = ug.group_id
       WHERE ug.user_id = ?`,
      [req.user.id],
      (err, groups) => {
        if (err) {
          console.error(err);
          return res.status(500).send('Database error');
        }
        if (!groups.length) {
          return res.render('faqs', { user: req.user, groups: [] });
        }
        const groupIds = groups.map(g => g.id);
        db.all(
          `SELECT gf.*, g.name as group_name 
           FROM group_faqs gf
           JOIN groups g ON gf.group_id = g.id
           WHERE gf.group_id IN (${groupIds.map(() => '?').join(',')})`,
          groupIds,
          (err, faqs) => {
            if (err) {
              console.error(err);
              return res.status(500).send('Database error');
            }
            const groupsWithFaqs = groups.map(group => ({
              ...group,
              faqs: faqs.filter(faq => faq.group_id === group.id)
            }));
            res.render('faqs', { user: req.user, groups: groupsWithFaqs });
          }
        );
      }
    );
});

// List FAQs for a group (admin only)
app.get('/admin/groups/:id/faqs', isAuthenticated, isAdmin, (req, res) => {
    db.all(
      `SELECT * FROM group_faqs WHERE group_id = ?`,
      [req.params.id],
      (err, faqs) => {
        if (err) return res.status(500).send('Database error');
        db.get(
          `SELECT name FROM groups WHERE id = ?`,
          [req.params.id],
          (err, group) => {
            if (err || !group) return res.status(404).send('Group not found');
            res.render('admin-faqs', { groupId: req.params.id, groupName: group.name, faqs });
          }
        );
      }
    );
});

// Add FAQ form (admin only)
app.get('/admin/groups/:id/faqs/add', isAuthenticated, isAdmin, (req, res) => {
    res.render('admin-faq_add', { groupId: req.params.id });
});

// Handle adding FAQ
app.post('/admin/groups/:id/faqs/add', isAuthenticated, isAdmin, (req, res) => {
    const { question, answer } = req.body;
    db.run(
      `INSERT INTO group_faqs (group_id, question, answer) VALUES (?, ?, ?)`,
      [req.params.id, question, answer],
      (err) => {
        if (err) return res.status(500).send('Database error');
        res.redirect(`/admin/groups/${req.params.id}/faqs`);
      }
    );
});

// Edit FAQ form
app.get('/admin/groups/:id/faqs/:faqId/edit', isAuthenticated, isAdmin, (req, res) => {
    db.get(
      `SELECT * FROM group_faqs WHERE id = ? AND group_id = ?`,
      [req.params.faqId, req.params.id],
      (err, faq) => {
        if (err || !faq) return res.status(404).send('FAQ not found');
        res.render('admin-faq-edit', { groupId: req.params.id, faq });
      }
    );
});

// Handle editing FAQ
app.post('/admin/groups/:id/faqs/:faqId/edit', isAuthenticated, isAdmin, (req, res) => {
    const { question, answer } = req.body;
    db.run(
      `UPDATE group_faqs SET question = ?, answer = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND group_id = ?`,
      [question, answer, req.params.faqId, req.params.id],
      (err) => {
        if (err) return res.status(500).send('Database error');
        res.redirect(`/admin/groups/${req.params.id}/faqs`);
      }
    );
});

// Delete FAQ
app.post('/admin/groups/:id/faqs/:faqId/delete', isAuthenticated, isAdmin, (req, res) => {
    db.run(
      `DELETE FROM group_faqs WHERE id = ? AND group_id = ?`,
      [req.params.faqId, req.params.id],
      (err) => {
        if (err) return res.status(500).send('Database error');
        res.redirect(`/admin/groups/${req.params.id}/faqs`);
      }
    );
});

app.get('/admin/groups/faqs', isAuthenticated, isAdmin, (req, res) => {
    db.all(
        `SELECT gf.*, g.name as group_name FROM group_faqs gf JOIN groups g ON gf.group_id = g.id`,
        [],
        (err, faqs) => {
            if (err) return res.status(500).send('Database error');
            res.render('admin-all-faqs', { faqs, user: req.user });
        }
    );
});
  
  app.get('/submissions', isAuthenticated, isAdmin, (req, res) => {
    db.all(
      `SELECT s.id as submission_id, s.submitted_at, u.name as user_name, u.email as user_email,
              ha.id as assignment_id, ha.title as assignment_title, ha.created_at,
              aq.id as question_id, aq.question,
              sa.yes_no_answer, sa.text_answer
       FROM submissions s
       JOIN users u ON s.user_id = u.id
       JOIN homework_assignments ha ON s.assignment_id = ha.id
       JOIN submission_answers sa ON s.id = sa.submission_id
       JOIN assignment_questions aq ON sa.question_id = aq.id
       ORDER BY ha.title, u.name, s.submitted_at, aq.id`,
      [],
      (err, rows) => {
        if (err) return res.status(500).send('Error fetching submissions');
  
        const groupedByAssignment = rows.reduce((acc, row) => {
          const assignmentId = row.assignment_id;
          if (!acc[assignmentId]) {
            acc[assignmentId] = {
              title: row.assignment_title,
              created_at: row.created_at, // Add created_at to the assignment object
              questions: [],
              submissions: []
            };
          }
          if (!acc[assignmentId].questions.some(q => q.id === row.question_id)) {
            acc[assignmentId].questions.push({ id: row.question_id, text: row.question });
          }
  
          let userSubmission = acc[assignmentId].submissions.find(sub => sub.user === row.user_name);
          if (!userSubmission) {
            userSubmission = {
              user: row.user_name,
              email: row.user_email,
              submitted_at: row.submitted_at,
              submission_id: row.submission_id,
              answers: []
            };
            acc[assignmentId].submissions.push(userSubmission);
          }
  
          const questionIndex = acc[assignmentId].questions.findIndex(q => q.id === row.question_id);
          while (userSubmission.answers.length <= questionIndex) {
            userSubmission.answers.push({ yes_no_answer: null, text_answer: null });
          }
          userSubmission.answers[questionIndex] = {
            yes_no_answer: row.yes_no_answer,
            text_answer: row.text_answer
          };
  
          return acc;
        }, {});
  
        const assignments = Object.values(groupedByAssignment);
        res.render('submissions', { user: req.user, assignments });
      }
    );
  });

  app.get('/admin/assignments', isAuthenticated, isAdmin, (req, res) => {
    db.all("SELECT * FROM homework_assignments", [], (err, assignments) => {
      if (err) return res.status(500).send('Error fetching assignments');
      // Fetch groups, users, and submissions for each assignment
      const assignmentPromises = assignments.map(assignment => {
        return new Promise((resolve, reject) => {
          db.all(
            `SELECT g.* FROM groups g JOIN assignment_groups ag ON g.id = ag.group_id WHERE ag.assignment_id = ?`,
            [assignment.id],
            (err, groups) => {
              if (err) return reject(err);
              assignment.groups = groups;
              const groupIds = groups.map(g => g.id);
              db.all(
                `SELECT DISTINCT u.id, u.name FROM users u JOIN user_groups ug ON u.id = ug.user_id WHERE ug.group_id IN (${groupIds.map(() => '?').join(',')})`,
                groupIds,
                (err, users) => {
                  if (err) return reject(err);
                  assignment.users = users;
                  db.all(
                    `SELECT u.id, u.name FROM submissions s JOIN users u ON s.user_id = u.id WHERE s.assignment_id = ?`,
                    [assignment.id],
                    (err, submittedUsers) => {
                      if (err) return reject(err);
                      assignment.submittedUsers = submittedUsers;
                      resolve(assignment);
                    }
                  );
                }
              );
            }
          );
        });
      });
      Promise.all(assignmentPromises)
        .then(assignmentsWithData => {
          res.render('admin-assignments', { user: req.user, assignments: assignmentsWithData });
        })
        .catch(err => {
          console.error(err);
          res.status(500).send('Error processing assignments');
        });
    });
  });

  app.get('/admin/assignments/:id', isAuthenticated, isAdmin, (req, res) => {
    console.log(`Route hit: /admin/assignments/${req.params.id}`);
    const assignmentId = req.params.id;
    db.get("SELECT * FROM homework_assignments WHERE id = ?", [assignmentId], (err, assignment) => {
      if (err || !assignment) return res.status(404).send('Assignment not found');
  
      // Fetch groups assigned to this assignment
      db.all(
        `SELECT g.* FROM groups g JOIN assignment_groups ag ON g.id = ag.group_id WHERE ag.assignment_id = ?`,
        [assignmentId],
        (err, groups) => {
          if (err) return res.status(500).send('Error fetching groups');
  
          // Fetch users in these groups
          const groupIds = groups.map(g => g.id);
          db.all(
            `SELECT DISTINCT u.id, u.name FROM users u JOIN user_groups ug ON u.id = ug.user_id WHERE ug.group_id IN (${groupIds.length ? groupIds.map(() => '?').join(',') : 'NULL'})`,
            groupIds,
            (err, users) => {
              if (err) return res.status(500).send('Error fetching users');
  
              // Fetch users who have submitted this assignment
              db.all(
                `SELECT u.id, u.name FROM submissions s JOIN users u ON s.user_id = u.id WHERE s.assignment_id = ?`,
                [assignmentId],
                (err, submittedUsers) => {
                  if (err) return res.status(500).send('Error fetching submissions');
                  res.render('assignment-details', { user: req.user, assignment, groups, users, submittedUsers });
                }
              );
            }
          );
        }
      );
    });
  });

  app.get('/admin/assignments/:id/results', isAuthenticated, isAdmin, (req, res) => {
    const assignmentId = req.params.id;
    db.get("SELECT * FROM homework_assignments WHERE id = ?", [assignmentId], (err, assignment) => {
      if (err || !assignment) return res.status(404).send('Assignment not found');
  
      // Fetch questions for this assignment
      db.all("SELECT * FROM assignment_questions WHERE assignment_id = ?", [assignmentId], (err, questions) => {
        if (err) return res.status(500).send('Error fetching questions');
  
        // Fetch submissions and answers
        db.all(
          `SELECT s.id as submission_id, u.name as user_name, sa.question_id, sa.yes_no_answer, sa.text_answer
           FROM submissions s
           JOIN users u ON s.user_id = u.id
           JOIN submission_answers sa ON s.id = sa.submission_id
           WHERE s.assignment_id = ?`,
          [assignmentId],
          (err, rows) => {
            if (err) return res.status(500).send('Error fetching submissions');
  
            // Organize data: map each user to their answers
            const userSubmissions = rows.reduce((acc, row) => {
              if (!acc[row.user_name]) {
                acc[row.user_name] = {};
              }
              acc[row.user_name][row.question_id] = {
                yes_no_answer: row.yes_no_answer,
                text_answer: row.text_answer
              };
              return acc;
            }, {});
  
            res.render('assignment-results', {
              user: req.user,
              assignment,
              questions,
              userSubmissions
            });
          }
        );
      });
    });
  });
  app.get('/submissions/:submissionId/details', isAuthenticated, isAdmin, (req, res) => {
    const submissionId = req.params.submissionId;
    db.get(
      `SELECT s.id as submission_id, s.submitted_at, u.name as user_name, u.email as user_email,
              ha.title as assignment_title, ha.created_at
       FROM submissions s
       JOIN users u ON s.user_id = u.id
       JOIN homework_assignments ha ON s.assignment_id = ha.id
       WHERE s.id = ?`,
      [submissionId],
      (err, submission) => {
        if (err || !submission) return res.status(404).send('Submission not found');
        db.all(
          `SELECT aq.question AS question_text, sa.question_id, sa.yes_no_answer, sa.text_answer
           FROM submission_answers sa
           JOIN assignment_questions aq ON sa.question_id = aq.id
           WHERE sa.submission_id = ?`,
          [submissionId],
          (err, answers) => {
            if (err) return res.status(500).send('Error fetching submission details');
            console.log('Answers:', answers);
            res.render('submission-details', { user: req.user, submission, answers });
          }
        );
      }
    );
  });
  
  // Start server
  app.listen(3000, () => {
    console.log('Server running on port 3000');
  });
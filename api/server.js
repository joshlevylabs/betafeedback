require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pool = require('./db'); // Adjusted path since server.js is in /api
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer');
const sendgridTransport = require('nodemailer-sendgrid-transport');
const pgSession = require('connect-pg-simple')(session);

const app = express();

// Middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');


app.get('/api/debug', (req, res) => {
    const fs = require('fs');
    const dirPath = path.join(__dirname, '..', 'public');
    fs.readdir(dirPath, (err, files) => {
      if (err) {
        return res.status(500).json({ error: 'Error reading public directory', details: err.message });
      }
      res.json({ files });
    });
  });


app.use(session({
    store: new pgSession({
      pool: pool,           // Use the same RDS pool
      tableName: 'session'  // Table to store sessions
    }),
    secret: process.env.SESSION_SECRET || 'your-session-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' } // Secure cookies in production
  }));

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(__dirname, '..', 'public', 'uploads'));
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname));
    }
  });
  
  const upload = multer({ storage: storage });

  async function sendAssignmentEmails(assignmentId, groupIds, assignmentTitle) {
    try {
      const { rows: users } = await pool.query(
        `SELECT DISTINCT u.email, u.name, ug.group_id
         FROM users u
         JOIN user_groups ug ON u.id = ug.user_id
         WHERE ug.group_id = ANY($1)`,
        [groupIds]
      );
      users.forEach(user => {
        const assignmentLink = `${process.env.APP_URL}/assignment/${assignmentId}/group/${user.group_id}`;
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
          if (error) console.error(`Error sending email to ${user.email}:`, error);
          else console.log(`Email sent to ${user.email}:`, info.response);
        });
      });
    } catch (err) {
      console.error('Error fetching users for email notification:', err);
    }
  }
  
  // Initial admin setup
  (async () => {
    const adminEmail = 'admin@example.com';
    const adminPassword = 'securepassword';
    try {
      const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [adminEmail]);
      if (rows.length === 0) {
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        await pool.query(
          "INSERT INTO users (name, email, password, is_admin) VALUES ($1, $2, $3, $4)",
          ['Admin User', adminEmail, hashedPassword, true]
        );
        console.log('Admin user created');
      }
    } catch (err) {
      console.error('Error creating admin:', err);
    }
  })();

  async function isAuthenticated(req, res, next) {
    if (req.session.userId) {
      try {
        const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [req.session.userId]);
        if (rows.length === 0) return res.redirect('/');
        req.user = rows[0];
        next();
      } catch (err) {
        console.error('Error fetching user:', err);
        res.redirect('/');
      }
    } else {
      res.redirect('/');
    }
  }
  
  function isAdmin(req, res, next) {
    if (req.user && req.user.is_admin) next();
    else res.status(403).send('Forbidden');
  }

  app.get('/api/home', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'home.html'));
  });
  
  app.post('/api/login', async (req, res) => {
    console.log('Received login request');
    const { email, password } = req.body;
    try {
      const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
      if (rows.length === 0) {
        console.log(`No user found with email: ${email}`);
        return res.status(400).send('Invalid credentials');
      }
      const user = rows[0];
      const match = await bcrypt.compare(password, user.password);
      if (match) {
        console.log(`Login successful for user: ${email}`);
        res.status(200).send('Login successful');
      } else {
        console.log(`Password mismatch for user: ${email}`);
        return res.status(400).send('Invalid credentials');
      }
    } catch (err) {
      console.error('Error during login:', err);
      res.status(500).send('Server error');
    }
  });

  // Logout endpoint
  app.post('/api/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
  });
  
// Dashboard
app.get('/api/dashboard', isAuthenticated, async (req, res) => {
    try {
      const groupsResult = await pool.query(
        `SELECT g.* FROM groups g
         JOIN user_groups ug ON g.id = ug.group_id
         WHERE ug.user_id = $1`,
        [req.user.id]
      );
  
      const assignmentsResult = await pool.query(
        `SELECT ha.*, s.id as submission_id, g.name as group_name
         FROM homework_assignments ha
         JOIN assignment_groups ag ON ha.id = ag.assignment_id
         JOIN user_groups ug ON ag.group_id = ug.group_id
         JOIN groups g ON ag.group_id = g.id
         LEFT JOIN submissions s ON ha.id = s.assignment_id AND s.user_id = $1
         WHERE ug.user_id = $2
         ORDER BY ha.created_at DESC`,
        [req.user.id, req.user.id]
      );
  
      const submitted = assignmentsResult.rows.filter(a => a.submission_id);
      const unsubmitted = assignmentsResult.rows.filter(a => !a.submission_id);
  
      res.render('dashboard', {
        user: req.user,
        groups: groupsResult.rows || [],
        submitted: submitted || [],
        unsubmitted: unsubmitted || []
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      res.status(500).send('Error fetching dashboard data');
    }
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
  
    let updateFields = [name, email, profileImage, req.user.id];
    let sql = "UPDATE users SET name = $1, email = $2, profile_image = $3";
  
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      sql += ", password = $4";
      updateFields = [name, email, profileImage, hashedPassword, req.user.id];
    }
  
    sql += " WHERE id = $4";
  
    try {
      await pool.query(sql, updateFields);
      req.user.name = name;
      req.user.email = email;
      req.user.profile_image = profileImage;
      res.redirect('/dashboard');
    } catch (err) {
      console.error('Database error:', err);
      res.status(500).send('Error updating profile: ' + err.message);
    }
  });
  
  // Admin user management routes
  app.get('/admin/users', isAuthenticated, isAdmin, async (req, res) => {
    const search = req.query.search || '';
    let sql = "SELECT * FROM users";
    let params = [];
  
    if (search) {
      sql += " WHERE name ILIKE $1 OR email ILIKE $1";
      params = [`%${search}%`];
    }
  
    try {
      const { rows: users } = await pool.query(sql, params);
      res.render('admin-users', { user: req.user, users: users, search: search });
    } catch (err) {
      console.error(err);
      res.status(500).send('Error fetching users');
    }
  });

  
app.get('/admin/users/add', isAuthenticated, isAdmin, (req, res) => {
    res.render('add-user', { user: req.user });
  });
  
  app.post('/admin/users/add', isAuthenticated, isAdmin, async (req, res) => {
    const { name, email, password, is_admin } = req.body;
    if (!name || !email || !password) {
      return res.status(400).send('Name, email, and password are required');
    }
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query(
        "INSERT INTO users (name, email, password, is_admin) VALUES ($1, $2, $3, $4)",
        [name, email, hashedPassword, is_admin === '1']
      );
      res.redirect('/admin/users');
    } catch (err) {
      console.error('Error adding user:', err);
      res.status(500).send('Error adding user');
    }
  });
  
  app.get('/admin/users/edit/:id', isAuthenticated, isAdmin, async (req, res) => {
    const userId = req.params.id;
    try {
      const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
      if (rows.length === 0) return res.status(404).send('User not found');
      res.render('edit-user', { user: req.user, editUser: rows[0] });
    } catch (err) {
      console.error('Error fetching user:', err);
      res.status(500).send('Error fetching user');
    }
  });
  
  app.post('/admin/users/edit/:id', isAuthenticated, isAdmin, async (req, res) => {
    const userId = req.params.id;
    const { name, email, password, is_admin } = req.body;
  
    try {
      const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
      if (rows.length === 0) return res.status(404).send('User not found');
  
      const existing = await pool.query("SELECT * FROM users WHERE email = $1 AND id != $2", [email, userId]);
      if (existing.rows.length > 0) return res.status(400).send('Email already in use');
  
      let updateFields = [name, email, is_admin === '1', userId];
      let sql = "UPDATE users SET name = $1, email = $2, is_admin = $3";
  
      if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        sql += ", password = $4";
        updateFields = [name, email, is_admin === '1', hashedPassword, userId];
      }
  
      sql += " WHERE id = $4";
      await pool.query(sql, updateFields);
      res.redirect('/admin/users');
    } catch (err) {
      console.error('Error updating user:', err);
      res.status(500).send('Error updating user');
    }
  });
  
  app.post('/admin/users/delete/:id', isAuthenticated, isAdmin, async (req, res) => {
    const userId = req.params.id;
    try {
      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
      res.redirect('/admin/users');
    } catch (err) {
      console.error('Error deleting user:', err);
      res.status(500).send('Error deleting user');
    }
  });
  
  app.get('/admin/users/groups/:id', isAuthenticated, isAdmin, async (req, res) => {
    const userId = req.params.id;
    try {
      const { rows: editUser } = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
      if (editUser.length === 0) return res.status(404).send('User not found');
  
      const groupsResult = await pool.query(
        `SELECT g.id, g.name, (ug.user_id IS NOT NULL) as is_member
         FROM groups g
         LEFT JOIN user_groups ug ON g.id = ug.group_id AND ug.user_id = $1`,
        [userId]
      );
  
      res.render('user-groups', { user: req.user, editUser: editUser[0], groups: groupsResult.rows });
    } catch (err) {
      console.error('Error fetching groups:', err);
      res.status(500).send('Error fetching groups');
    }
  });
  
  app.post('/admin/users/groups/:id', isAuthenticated, isAdmin, async (req, res) => {
    const userId = req.params.id;
    const groupIds = req.body.groupIds || [];
  
    try {
      await pool.query("DELETE FROM user_groups WHERE user_id = $1", [userId]);
      for (const groupId of groupIds) {
        await pool.query("INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2)", [userId, groupId]);
      }
      res.redirect('/admin/users');
    } catch (err) {
      console.error('Error updating groups:', err);
      res.status(500).send('Error updating groups');
    }
  });
  
  // Group management routes
  app.get('/admin/groups', isAuthenticated, isAdmin, async (req, res) => {
    const search = req.query.search || '';
    let sql = "SELECT * FROM groups";
    let params = [];
  
    if (search) {
      sql += " WHERE name ILIKE $1 OR description ILIKE $1";
      params = [`%${search}%`];
    }
  
    try {
      const { rows: groups } = await pool.query(sql, params);
      res.render('admin-groups', { user: req.user, groups: groups, search: search });
    } catch (err) {
      console.error('Error fetching groups:', err);
      res.status(500).send('Error fetching groups');
    }
  });
  
  app.get('/admin/groups/add', isAuthenticated, isAdmin, (req, res) => {
    res.render('add-group', { user: req.user });
  });
  
  app.post('/admin/groups/add', isAuthenticated, isAdmin, async (req, res) => {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).send('Group name is required');
    }
    try {
      await pool.query(
        "INSERT INTO groups (name, description) VALUES ($1, $2)",
        [name, description || '']
      );
      res.redirect('/admin/groups');
    } catch (err) {
      console.error('Error adding group:', err);
      res.status(500).send('Error adding group');
    }
  });
  
  app.get('/admin/groups/edit/:id', isAuthenticated, isAdmin, async (req, res) => {
    const groupId = req.params.id;
    try {
      const { rows } = await pool.query("SELECT * FROM groups WHERE id = $1", [groupId]);
      if (rows.length === 0) return res.status(404).send('Group not found');
      res.render('edit-group', { user: req.user, group: rows[0] });
    } catch (err) {
      console.error('Error fetching group:', err);
      res.status(500).send('Error fetching group');
    }
  });
  
  app.post('/admin/groups/edit/:id', isAuthenticated, isAdmin, async (req, res) => {
    const groupId = req.params.id;
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).send('Group name is required');
    }
    try {
      await pool.query(
        "UPDATE groups SET name = $1, description = $2 WHERE id = $3",
        [name, description || '', groupId]
      );
      res.redirect('/admin/groups');
    } catch (err) {
      console.error('Error updating group:', err);
      res.status(500).send('Error updating group');
    }
  });
  
  app.post('/admin/groups/delete/:id', isAuthenticated, isAdmin, async (req, res) => {
    const groupId = req.params.id;
    try {
      await pool.query("DELETE FROM user_groups WHERE group_id = $1", [groupId]);
      await pool.query("DELETE FROM groups WHERE id = $1", [groupId]);
      res.redirect('/admin/groups');
    } catch (err) {
      console.error('Error deleting group:', err);
      res.status(500).send('Error deleting group');
    }
  });
  
  app.get('/admin/groups/manage-users/:id', isAuthenticated, isAdmin, async (req, res) => {
    const groupId = req.params.id;
    try {
      const { rows: group } = await pool.query("SELECT * FROM groups WHERE id = $1", [groupId]);
      if (group.length === 0) return res.status(404).send('Group not found');
  
      const usersResult = await pool.query(
        `SELECT u.id, u.name, u.profile_image, (ug.group_id IS NOT NULL) as is_member
         FROM users u
         LEFT JOIN user_groups ug ON u.id = ug.user_id AND ug.group_id = $1`,
        [groupId]
      );
  
      res.render('manage-group-users', { user: req.user, group: group[0], users: usersResult.rows });
    } catch (err) {
      console.error('Error fetching users:', err);
      res.status(500).send('Error fetching users');
    }
  });
  
  app.post('/admin/groups/manage-users/:id', isAuthenticated, isAdmin, async (req, res) => {
    const groupId = req.params.id;
    const userIds = req.body.userIds || [];
  
    try {
      await pool.query("DELETE FROM user_groups WHERE group_id = $1", [groupId]);
      for (const userId of userIds) {
        await pool.query("INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2)", [userId, groupId]);
      }
      res.redirect('/admin/groups');
    } catch (err) {
      console.error('Error updating user groups:', err);
      res.status(500).send('Error updating user groups');
    }
  });
  
  // Group details
  app.get('/groups/:id', isAuthenticated, async (req, res) => {
    const groupId = req.params.id;
    const userId = req.user.id;
  
    try {
      const { rows: group } = await pool.query("SELECT * FROM groups WHERE id = $1", [groupId]);
      if (group.length === 0) return res.status(404).send('Group not found');
  
      const membersResult = await pool.query(
        `SELECT u.id, u.name, u.profile_image FROM users u
         JOIN user_groups ug ON u.id = ug.user_id
         WHERE ug.group_id = $1`,
        [groupId]
      );
  
      const assignmentsResult = await pool.query(
        `SELECT ha.* FROM homework_assignments ha
         JOIN assignment_groups ag ON ha.id = ag.assignment_id
         WHERE ag.group_id = $1`,
        [groupId]
      );
  
      const submissionsResult = await pool.query(
        `SELECT s.* FROM submissions s
         WHERE s.user_id = $1 AND s.assignment_id IN (
           SELECT assignment_id FROM assignment_groups WHERE group_id = $2
         )`,
        [userId, groupId]
      );
  
      const submittedAssignmentIds = submissionsResult.rows.map(s => s.assignment_id);
      const outstandingAssignments = assignmentsResult.rows.filter(
        a => !submittedAssignmentIds.includes(a.id)
      );
  
      res.render('group-details', {
        user: req.user,
        group: group[0],
        members: membersResult.rows,
        assignments: assignmentsResult.rows,
        submissions: submissionsResult.rows,
        outstandingAssignments: outstandingAssignments
      });
    } catch (err) {
      console.error('Error fetching group details:', err);
      res.status(500).send('Error fetching group details');
    }
  });
  
  // Assignment creation routes
  app.get('/create-assignment', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { rows: groups } = await pool.query("SELECT * FROM groups");
      res.render('create-assignment', { user: req.user, groups });
    } catch (err) {
      console.error('Error fetching groups:', err);
      res.status(500).send('Error fetching groups');
    }
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
  
  // POST: Handle assignment creation with transaction
  app.post('/create-assignment', isAuthenticated, isAdmin, async (req, res) => {
    const { title, description, requirements, groupIds, context, question, hasYesNo, yesNoRequired, hasTextInput, textInputRequired, photoPaths = [], videoPaths = [], relatedDownloads } = req.body;
  
    if (!groupIds || groupIds.length === 0) {
      return res.status(400).send('At least one group must be selected');
    }
  
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
  
      const assignmentResult = await client.query(
        'INSERT INTO homework_assignments (title, description, requirements, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
        [title, description, requirements || null, req.user.id]
      );
      const assignmentId = assignmentResult.rows[0].id;
  
      for (const groupId of groupIds) {
        await client.query(
          "INSERT INTO assignment_groups (assignment_id, group_id) VALUES ($1, $2)",
          [assignmentId, groupId]
        );
      }
  
      if (relatedDownloads && Array.isArray(relatedDownloads)) {
        for (let i = 0; i < groupIds.length; i++) {
          const fileIds = relatedDownloads[i] || [];
          for (const fileId of fileIds) {
            await client.query(
              "INSERT INTO assignment_group_downloads (assignment_id, group_id, file_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
              [assignmentId, groupIds[i], fileId]
            );
          }
        }
      }
  
      if (question && Array.isArray(question) && question.length > 0) {
        for (let i = 0; i < question.length; i++) {
          const qPhotoPaths = Array.isArray(photoPaths[i]) ? photoPaths[i] : (photoPaths[i] ? [photoPaths[i]] : []);
          const qVideoPaths = Array.isArray(videoPaths[i]) ? videoPaths[i] : (videoPaths[i] ? [videoPaths[i]] : []);
          const photoPath = qPhotoPaths.length > 0 ? qPhotoPaths.join(',') : null;
          const videoPath = qVideoPaths.length > 0 ? qVideoPaths.join(',') : null;
  
          await client.query(
            `INSERT INTO assignment_questions (
              assignment_id, context, question, has_yes_no, yes_no_required, has_text_input, text_input_required, photo_path, video_path
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              assignmentId,
              context && context[i] ? context[i] : null,
              question[i],
              hasYesNo && hasYesNo[i] ? true : false,
              yesNoRequired && yesNoRequired[i] ? true : false,
              hasTextInput && hasTextInput[i] ? true : false,
              textInputRequired && textInputRequired[i] ? true : false,
              photoPath,
              videoPath
            ]
          );
        }
      }
  
      await client.query('COMMIT');
      sendAssignmentEmails(assignmentId, groupIds, title);
      res.redirect('/assignments');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error creating assignment:', err);
      res.status(500).send('Error creating assignment');
    } finally {
      client.release();
    }
  });
  
  // Delete assignment route with transaction
  app.post('/admin/assignments/delete/:id', isAuthenticated, isAdmin, async (req, res) => {
    const assignmentId = req.params.id;
    const client = await pool.connect();
  
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM assignment_groups WHERE assignment_id = $1', [assignmentId]);
      await client.query('DELETE FROM assignment_questions WHERE assignment_id = $1', [assignmentId]);
      await client.query('DELETE FROM submissions WHERE assignment_id = $1', [assignmentId]);
      await client.query('DELETE FROM homework_assignments WHERE id = $1', [assignmentId]);
      await client.query('COMMIT');
      res.redirect('/admin/assignments');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error deleting assignment:', err);
      res.status(500).send('Error deleting assignment');
    } finally {
      client.release();
    }
  });
  
  // Feedback
  app.get('/feedback', isAuthenticated, (req, res) => {
    res.render('feedback', { user: req.user });
  });
  
  // Assignments
  app.get('/assignments', isAuthenticated, async (req, res) => {
    try {
      const { rows: assignments } = await pool.query(
        `SELECT ha.*, ag.group_id, s.id as submission_id, g.name as group_name
         FROM homework_assignments ha
         JOIN assignment_groups ag ON ha.id = ag.assignment_id
         JOIN user_groups ug ON ag.group_id = ug.group_id
         JOIN groups g ON ag.group_id = g.id
         LEFT JOIN submissions s ON ha.id = s.assignment_id AND s.user_id = $1
         WHERE ug.user_id = $2
         ORDER BY ha.created_at DESC`,
        [req.user.id, req.user.id]
      );
  
      const completed = assignments.filter(a => a.submission_id);
      const uncompleted = assignments.filter(a => !a.submission_id);
      res.render('assignments', { user: req.user, completed, uncompleted });
    } catch (err) {
      console.error('Error fetching assignments:', err);
      res.status(500).send('Error fetching assignments');
    }
  });
  
  // Submit assignment with transaction
  app.post('/submit-assignment', isAuthenticated, async (req, res) => {
    const { assignmentId, yesNo = [], textAnswer = [] } = req.body;
    const client = await pool.connect();
  
    try {
      await client.query('BEGIN');
  
      const existing = await client.query(
        'SELECT id FROM submissions WHERE assignment_id = $1 AND user_id = $2',
        [assignmentId, req.user.id]
      );
      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).send('You have already submitted this assignment');
      }
  
      const submissionResult = await client.query(
        'INSERT INTO submissions (assignment_id, user_id) VALUES ($1, $2) RETURNING id',
        [assignmentId, req.user.id]
      );
      const submissionId = submissionResult.rows[0].id;
  
      const questionsResult = await client.query(
        'SELECT id FROM assignment_questions WHERE assignment_id = $1 ORDER BY id',
        [assignmentId]
      );
  
      for (let i = 0; i < questionsResult.rows.length; i++) {
        const questionId = questionsResult.rows[i].id;
        const yesNoValue = yesNo[i] === 'yes' ? true : yesNo[i] === 'no' ? false : null;
        const textValue = textAnswer[i] || null;
  
        await client.query(
          'INSERT INTO submission_answers (submission_id, question_id, yes_no_answer, text_answer) VALUES ($1, $2, $3, $4)',
          [submissionId, questionId, yesNoValue, textValue]
        );
      }
  
      await client.query('COMMIT');
      res.redirect('/assignments');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error submitting assignment:', err);
      res.status(500).send('Error submitting assignment');
    } finally {
      client.release();
    }
  });
  
  // Assignment view routes
  app.get('/assignment/:id', isAuthenticated, async (req, res) => {
    const assignmentId = req.params.id;
    const userId = req.user.id;
  
    try {
      const { rows } = await pool.query(
        `SELECT ag.group_id
         FROM assignment_groups ag
         JOIN user_groups ug ON ag.group_id = ug.group_id
         WHERE ag.assignment_id = $1 AND ug.user_id = $2
         LIMIT 1`,
        [assignmentId, userId]
      );
      if (rows.length === 0) return res.status(404).send('Assignment or group not found for this user');
      res.redirect(`/assignment/${assignmentId}/group/${rows[0].group_id}`);
    } catch (err) {
      console.error('Error redirecting assignment:', err);
      res.status(500).send('Error redirecting assignment');
    }
  });
  
  app.get('/assignment/:assignmentId/group/:groupId', isAuthenticated, async (req, res) => {
    const { assignmentId, groupId } = req.params;
    const userId = req.user.id;
  
    try {
      const userGroupResult = await pool.query(
        `SELECT * FROM user_groups WHERE user_id = $1 AND group_id = $2`,
        [userId, groupId]
      );
      if (userGroupResult.rows.length === 0) {
        return res.status(403).send('You do not have access to this assignment for this group');
      }
  
      const assignmentResult = await pool.query(
        'SELECT * FROM homework_assignments WHERE id = $1',
        [assignmentId]
      );
      if (assignmentResult.rows.length === 0) return res.status(404).send('Assignment not found');
  
      const questionsResult = await pool.query(
        'SELECT * FROM assignment_questions WHERE assignment_id = $1',
        [assignmentId]
      );
  
      const downloadsResult = await pool.query(
        `SELECT gf.* FROM group_files gf
         JOIN assignment_group_downloads agd ON gf.id = agd.file_id
         WHERE agd.assignment_id = $1 AND agd.group_id = $2`,
        [assignmentId, groupId]
      );
  
      const submissionResult = await pool.query(
        'SELECT * FROM submissions WHERE assignment_id = $1 AND user_id = $2',
        [assignmentId, userId]
      );
  
      res.render('assignment', {
        user: req.user,
        assignment: assignmentResult.rows[0],
        questions: questionsResult.rows,
        relatedDownloads: downloadsResult.rows,
        groupId,
        hasSubmitted: submissionResult.rows.length > 0
      });
    } catch (err) {
      console.error('Error fetching assignment:', err);
      res.status(500).send('Error fetching assignment');
    }
  });
  
  // Downloads
  app.get('/downloads', isAuthenticated, async (req, res) => {
    const userId = req.user.id;
    const isAdmin = req.user.is_admin;
  
    try {
      let groupQuery = isAdmin
        ? 'SELECT * FROM groups'
        : 'SELECT g.* FROM groups g JOIN user_groups ug ON g.id = ug.group_id WHERE ug.user_id = $1';
      const groupsResult = await pool.query(groupQuery, isAdmin ? [] : [userId]);
      const groupIds = groupsResult.rows.map(g => g.id);
  
      const filesResult = await pool.query(
        `SELECT id, file_name, file_path, is_link, group_id FROM group_files WHERE group_id = ANY($1)`,
        [groupIds]
      );
  
      const groupsWithFiles = groupsResult.rows.map(group => {
        const groupFiles = filesResult.rows.filter(f => f.group_id === group.id);
        return { ...group, files: groupFiles };
      });
  
      res.render('downloads', { user: req.user, groups: groupsWithFiles });
    } catch (err) {
      console.error('Error fetching downloads:', err);
      res.status(500).send('Error fetching downloads');
    }
  });
  
  app.post('/admin/groups/:id/upload', isAuthenticated, isAdmin, upload.single('file'), async (req, res) => {
    const groupId = req.params.id;
    const file = req.file;
  
    if (!file) return res.status(400).send('No file uploaded');
  
    const fileName = file.originalname;
    const filePath = '/uploads/' + file.filename;
  
    try {
      await pool.query(
        'INSERT INTO group_files (group_id, file_name, file_path, uploaded_by, is_link) VALUES ($1, $2, $3, $4, $5)',
        [groupId, fileName, filePath, req.user.id, false]
      );
      res.redirect('/downloads');
    } catch (err) {
      console.error('Error uploading file:', err);
      res.status(500).send('Error uploading file');
    }
  });
  
  app.get('/api/downloads', isAuthenticated, async (req, res) => {
    const groupIds = req.query.groupIds ? req.query.groupIds.split(',') : [];
    if (groupIds.length === 0) return res.json([]);
  
    try {
      const { rows: downloads } = await pool.query(
        `SELECT gf.id, gf.file_name, gf.group_id, g.name as group_name
         FROM group_files gf
         JOIN groups g ON gf.group_id = g.id
         WHERE gf.group_id = ANY($1)`,
        [groupIds]
      );
      res.json(downloads);
    } catch (err) {
      console.error('Error fetching downloads:', err);
      res.status(500).json([]);
    }
  });
  
  app.post('/admin/groups/:id/add-link', isAuthenticated, isAdmin, async (req, res) => {
    const groupId = req.params.id;
    const { title, link } = req.body;
  
    if (!title || !link) return res.status(400).send('Title and link are required');
  
    try {
      await pool.query(
        'INSERT INTO group_files (group_id, file_name, file_path, uploaded_by, is_link) VALUES ($1, $2, $3, $4, $5)',
        [groupId, title, link, req.user.id, true]
      );
      res.redirect('/downloads');
    } catch (err) {
      console.error('Error adding link:', err);
      res.status(500).send('Error adding link');
    }
  });
  
  // FAQs
  app.get('/faqs', isAuthenticated, async (req, res) => {
    try {
      const groupsResult = await pool.query(
        `SELECT g.* FROM groups g
         JOIN user_groups ug ON g.id = ug.group_id
         WHERE ug.user_id = $1`,
        [req.user.id]
      );
  
      if (groupsResult.rows.length === 0) {
        return res.render('faqs', { user: req.user, groups: [] });
      }
  
      const groupIds = groupsResult.rows.map(g => g.id);
      const faqsResult = await pool.query(
        `SELECT gf.*, g.name as group_name 
         FROM group_faqs gf
         JOIN groups g ON gf.group_id = g.id
         WHERE gf.group_id = ANY($1)`,
        [groupIds]
      );
  
      const groupsWithFaqs = groupsResult.rows.map(group => ({
        ...group,
        faqs: faqsResult.rows.filter(faq => faq.group_id === group.id)
      }));
  
      res.render('faqs', { user: req.user, groups: groupsWithFaqs });
    } catch (err) {
      console.error('Error fetching FAQs:', err);
      res.status(500).send('Database error');
    }
  });
  
  app.get('/admin/groups/:id/faqs', isAuthenticated, isAdmin, async (req, res) => {
    const groupId = req.params.id;
    try {
      const faqsResult = await pool.query(
        `SELECT * FROM group_faqs WHERE group_id = $1`,
        [groupId]
      );
      const groupResult = await pool.query(
        `SELECT name FROM groups WHERE id = $1`,
        [groupId]
      );
      if (groupResult.rows.length === 0) return res.status(404).send('Group not found');
      res.render('admin-faqs', { groupId, groupName: groupResult.rows[0].name, faqs: faqsResult.rows });
    } catch (err) {
      console.error('Error fetching FAQs:', err);
      res.status(500).send('Database error');
    }
  });
  
  app.get('/admin/groups/:id/faqs/add', isAuthenticated, isAdmin, (req, res) => {
    res.render('admin-faq_add', { groupId: req.params.id });
  });
  
  app.post('/admin/groups/:id/faqs/add', isAuthenticated, isAdmin, async (req, res) => {
    const { question, answer } = req.body;
    const groupId = req.params.id;
    try {
      await pool.query(
        `INSERT INTO group_faqs (group_id, question, answer) VALUES ($1, $2, $3)`,
        [groupId, question, answer]
      );
      res.redirect(`/admin/groups/${groupId}/faqs`);
    } catch (err) {
      console.error('Error adding FAQ:', err);
      res.status(500).send('Database error');
    }
  });
  
  app.get('/admin/groups/:id/faqs/:faqId/edit', isAuthenticated, isAdmin, async (req, res) => {
    const { id, faqId } = req.params;
    try {
      const { rows } = await pool.query(
        `SELECT * FROM group_faqs WHERE id = $1 AND group_id = $2`,
        [faqId, id]
      );
      if (rows.length === 0) return res.status(404).send('FAQ not found');
      res.render('admin-faq-edit', { groupId: id, faq: rows[0] });
    } catch (err) {
      console.error('Error fetching FAQ:', err);
      res.status(500).send('Database error');
    }
  });
  
  app.post('/admin/groups/:id/faqs/:faqId/edit', isAuthenticated, isAdmin, async (req, res) => {
    const { id, faqId } = req.params;
    const { question, answer } = req.body;
    try {
      await pool.query(
        `UPDATE group_faqs SET question = $1, answer = $2, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $3 AND group_id = $4`,
        [question, answer, faqId, id]
      );
      res.redirect(`/admin/groups/${id}/faqs`);
    } catch (err) {
      console.error('Error updating FAQ:', err);
      res.status(500).send('Database error');
    }
  });
  
  app.post('/admin/groups/:id/faqs/:faqId/delete', isAuthenticated, isAdmin, async (req, res) => {
    const { id, faqId } = req.params;
    try {
      await pool.query(
        `DELETE FROM group_faqs WHERE id = $1 AND group_id = $2`,
        [faqId, id]
      );
      res.redirect(`/admin/groups/${id}/faqs`);
    } catch (err) {
      console.error('Error deleting FAQ:', err);
      res.status(500).send('Database error');
    }
  });
  
  app.get('/admin/groups/faqs', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { rows: faqs } = await pool.query(
        `SELECT gf.*, g.name as group_name FROM group_faqs gf JOIN groups g ON gf.group_id = g.id`
      );
      res.render('admin-all-faqs', { faqs, user: req.user });
    } catch (err) {
      console.error('Error fetching all FAQs:', err);
      res.status(500).send('Database error');
    }
  });
  
  // Submissions
  app.get('/submissions', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT s.id as submission_id, s.submitted_at, u.name as user_name, u.email as user_email,
                ha.id as assignment_id, ha.title as assignment_title, ha.created_at,
                aq.id as question_id, aq.question,
                sa.yes_no_answer, sa.text_answer
         FROM submissions s
         JOIN users u ON s.user_id = u.id
         JOIN homework_assignments ha ON s.assignment_id = ha.id
         JOIN submission_answers sa ON s.id = sa.submission_id
         JOIN assignment_questions aq ON sa.question_id = aq.id
         ORDER BY ha.title, u.name, s.submitted_at, aq.id`
      );
  
      const groupedByAssignment = rows.reduce((acc, row) => {
        const assignmentId = row.assignment_id;
        if (!acc[assignmentId]) {
          acc[assignmentId] = {
            title: row.assignment_title,
            created_at: row.created_at,
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
    } catch (err) {
      console.error('Error fetching submissions:', err);
      res.status(500).send('Error fetching submissions');
    }
  });
  
  // Admin assignments
  app.get('/admin/assignments', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { rows: assignments } = await pool.query("SELECT * FROM homework_assignments");
      const assignmentPromises = assignments.map(async (assignment) => {
        const groupsResult = await pool.query(
          `SELECT g.* FROM groups g JOIN assignment_groups ag ON g.id = ag.group_id WHERE ag.assignment_id = $1`,
          [assignment.id]
        );
        const groupIds = groupsResult.rows.map(g => g.id);
  
        const usersResult = await pool.query(
          `SELECT DISTINCT u.id, u.name FROM users u JOIN user_groups ug ON u.id = ug.user_id WHERE ug.group_id = ANY($1)`,
          [groupIds]
        );
  
        const submittedUsersResult = await pool.query(
          `SELECT u.id, u.name FROM submissions s JOIN users u ON s.user_id = u.id WHERE s.assignment_id = $1`,
          [assignment.id]
        );
  
        return {
          ...assignment,
          groups: groupsResult.rows,
          users: usersResult.rows,
          submittedUsers: submittedUsersResult.rows
        };
      });
  
      const assignmentsWithData = await Promise.all(assignmentPromises);
      res.render('admin-assignments', { user: req.user, assignments: assignmentsWithData });
    } catch (err) {
      console.error('Error processing assignments:', err);
      res.status(500).send('Error processing assignments');
    }
  });
  
  app.get('/admin/assignments/:id', isAuthenticated, isAdmin, async (req, res) => {
    const assignmentId = req.params.id;
    try {
      const assignmentResult = await pool.query(
        "SELECT * FROM homework_assignments WHERE id = $1",
        [assignmentId]
      );
      if (assignmentResult.rows.length === 0) return res.status(404).send('Assignment not found');
  
      const groupsResult = await pool.query(
        `SELECT g.* FROM groups g JOIN assignment_groups ag ON g.id = ag.group_id WHERE ag.assignment_id = $1`,
        [assignmentId]
      );
  
      const groupIds = groupsResult.rows.map(g => g.id);
      const usersResult = await pool.query(
        `SELECT DISTINCT u.id, u.name FROM users u JOIN user_groups ug ON u.id = ug.user_id WHERE ug.group_id = ANY($1)`,
        [groupIds]
      );
  
      const submittedUsersResult = await pool.query(
        `SELECT u.id, u.name FROM submissions s JOIN users u ON s.user_id = u.id WHERE s.assignment_id = $1`,
        [assignmentId]
      );
  
      res.render('assignment-details', {
        user: req.user,
        assignment: assignmentResult.rows[0],
        groups: groupsResult.rows,
        users: usersResult.rows,
        submittedUsers: submittedUsersResult.rows
      });
    } catch (err) {
      console.error('Error fetching assignment details:', err);
      res.status(500).send('Error fetching assignment details');
    }
  });
  
  app.get('/admin/assignments/:id/results', isAuthenticated, isAdmin, async (req, res) => {
    const assignmentId = req.params.id;
    try {
      const assignmentResult = await pool.query(
        "SELECT * FROM homework_assignments WHERE id = $1",
        [assignmentId]
      );
      if (assignmentResult.rows.length === 0) return res.status(404).send('Assignment not found');
  
      const questionsResult = await pool.query(
        "SELECT * FROM assignment_questions WHERE assignment_id = $1",
        [assignmentId]
      );
  
      const submissionsResult = await pool.query(
        `SELECT s.id as submission_id, u.name as user_name, sa.question_id, sa.yes_no_answer, sa.text_answer
         FROM submissions s
         JOIN users u ON s.user_id = u.id
         JOIN submission_answers sa ON s.id = sa.submission_id
         WHERE s.assignment_id = $1`,
        [assignmentId]
      );
  
      const userSubmissions = submissionsResult.rows.reduce((acc, row) => {
        if (!acc[row.user_name]) acc[row.user_name] = {};
        acc[row.user_name][row.question_id] = {
          yes_no_answer: row.yes_no_answer,
          text_answer: row.text_answer
        };
        return acc;
      }, {});
  
      res.render('assignment-results', {
        user: req.user,
        assignment: assignmentResult.rows[0],
        questions: questionsResult.rows,
        userSubmissions
      });
    } catch (err) {
      console.error('Error fetching assignment results:', err);
      res.status(500).send('Error fetching assignment results');
    }
  });
  
  app.get('/submissions/:submissionId/details', isAuthenticated, isAdmin, async (req, res) => {
    const submissionId = req.params.submissionId;
    try {
      const submissionResult = await pool.query(
        `SELECT s.id as submission_id, s.submitted_at, u.name as user_name, u.email as user_email,
                ha.title as assignment_title, ha.created_at
         FROM submissions s
         JOIN users u ON s.user_id = u.id
         JOIN homework_assignments ha ON s.assignment_id = ha.id
         WHERE s.id = $1`,
        [submissionId]
      );
      if (submissionResult.rows.length === 0) return res.status(404).send('Submission not found');
  
      const answersResult = await pool.query(
        `SELECT aq.question AS question_text, sa.question_id, sa.yes_no_answer, sa.text_answer
         FROM submission_answers sa
         JOIN assignment_questions aq ON sa.question_id = aq.id
         WHERE sa.submission_id = $1`,
        [submissionId]
      );
  
      res.render('submission-details', {
        user: req.user,
        submission: submissionResult.rows[0],
        answers: answersResult.rows
      });
    } catch (err) {
      console.error('Error fetching submission details:', err);
      res.status(500).send('Error fetching submission details');
    }
  });
  
  if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  }
  
  module.exports = app;
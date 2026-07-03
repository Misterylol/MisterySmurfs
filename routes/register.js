const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../db');
const { check, validationResult } = require('express-validator');

// Registration page
router.get('/', (req, res) => {
  const successMessage = req.session.successMessage;
  const errors = req.session.errors;
  delete req.session.successMessage; // Clear success message
  delete req.session.errors; // Clear errors
  if (req.session.user) {
    return res.redirect('/'); // Redirect to the Home page if a user is logged in
  }
  res.render('register', { successMessage, errors, activeTab: 'register' });

});

// Registration form submission
router.post(
  '/',
  [
    check('username')
      .not()
      .isEmpty()
      .withMessage('Username is required')
      .isLength({ min: 4, max: 20 })
      .withMessage('Username must be between 4 and 20 characters long'),
    check('password')
      .not()
      .isEmpty()
      .withMessage('Password is required')
      .isLength({ min: 6, max: 30 })
      .withMessage('Password must be between 6 and 30 characters long'),
    check('email')
      .isEmail()
      .withMessage('Invalid email address'),
    check('confirmPassword')
      .custom((value, { req }) => {
        if (value !== req.body.password) {
          throw new Error('Password confirmation does not match password');
        }
        return true;
      }),
  ],
  async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map((error) => error.msg);
      req.session.errors = errorMessages;
      res.redirect('/register');
    } else {
      const { username, email, password } = req.body;


      try {
        const emailCheckValues = [email];
        const [existingEmailRows] = await pool.execute('SELECT * FROM users WHERE email = ?', emailCheckValues);

        if (existingEmailRows.length > 0) {
          req.session.errors = ['Email address is already in use. Please choose a different email.'];
          res.redirect('/register');
        } else {
          // Continue with the registration process
          const hashedPassword = await bcrypt.hash(password, 10);

          const checkQuery = 'SELECT * FROM users WHERE username = ?';
          const checkValues = [username];

          try {
            const [existingRows, existingFields] = await pool.execute(checkQuery, checkValues);

            if (existingRows.length > 0) {
              req.session.errors = ['Username already exists. Please choose a different username.'];
              res.redirect('/register');
            } else {
              const insertQuery = 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)';
              const insertValues = [username, email, hashedPassword];

              try {
                const [rows, fields] = await pool.execute(insertQuery, insertValues);

                // Fetch user data from the database after registration
                const [userRows] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);

                if (userRows.length === 1) {
                  const user = userRows[0];
                  const userWithoutPassword = { ...user };
                  delete userWithoutPassword.password; // Remove the password from the user object

                  req.session.user = userWithoutPassword;
                  req.session.successMessage = 'Registration successful!';
                  return res.redirect('/');
                } else {
                  req.session.errors = ['Error fetching user data after registration'];
                  res.redirect('/register');
                }
              } catch (error) {
                console.error('Error registering user:', error);
                req.session.errors = ['Error registering user'];
                res.redirect('/register');
              }
            }
          } catch (error) {
            console.error('Error checking for existing username:', error);
            req.session.errors = ['Error checking for existing username'];
            res.redirect('/register');
          }
        }
      } catch (error) {
        console.error('Error checking for existing email:', error);
        req.session.errors = ['Error checking for existing email'];
        res.redirect('/register');
      }
    }
  }
);

module.exports = router;

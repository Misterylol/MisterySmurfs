const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { check, validationResult } = require('express-validator');
const pool = require('../db');

// Route to render the reset-password page
router.get('/:resetToken', async (req, res) => {
  const resetToken = req.params.resetToken;
  const isValidToken = await validateResetToken(resetToken);

  if (isValidToken) {
    return res.render('reset-password', { resetToken, activeTab: 'reset-password' });
  }

  return res.status(400).render('reset-password', {
    resetToken: '',
    errors: ['This password reset link is invalid or has expired.'],
    activeTab: 'reset-password',
  });
});

// Route to handle the reset-password form submission
router.post(
  '/',
  [
    check('password')
      .not()
      .isEmpty()
      .withMessage('Password is required')
      .isLength({ min: 6, max: 30 })
      .withMessage('Password must be between 6 and 30 characters long'),
  ],
  async (req, res) => {
    const { resetToken, password } = req.body;
    const isValidToken = await validateResetToken(resetToken);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map((error) => error.msg);
      return res.status(400).render('reset-password', { resetToken, errors: errorMessages, activeTab: 'reset-password' });
    }

    if (isValidToken) {
      try {
        const userId = await getUserIdByResetToken(resetToken);
        await updatePassword(userId, password);
        await deleteResetToken(resetToken);

        return res.redirect('/login');
      } catch (error) {
        console.error('Error updating user password:', error);
        return res.status(500).render('reset-password', {
          resetToken,
          errors: ['Unable to reset password. Please try again.'],
          activeTab: 'reset-password',
        });
      }
    }

    return res.status(400).render('reset-password', {
      resetToken: '',
      errors: ['This password reset link is invalid or has expired.'],
      activeTab: 'reset-password',
    });
  }
);

const getUserIdByResetToken = async (resetToken) => {
  const query = 'SELECT user_id FROM password_reset_tokens WHERE token = ?';
  const values = [resetToken];

  try {
    const [rows] = await pool.execute(query, values);

    if (rows.length > 0) {
      return rows[0].user_id;
    } else {
      throw new Error('Invalid reset token');
    }
  } catch (error) {
    console.error('Error getting user ID by reset token:', error);
    throw error;
  }
};

const updatePassword = async (userId, password) => {
  const hashedPassword = await bcrypt.hash(password, 10);

  const updateQuery = 'UPDATE users SET password = ? WHERE id = ?';
  const updateValues = [hashedPassword, userId];

  try {
    await pool.execute(updateQuery, updateValues);
  } catch (error) {
    console.error('Error updating user password:', error);
    throw error;
  }
};

const deleteResetToken = async (resetToken) => {
  await pool.execute('DELETE FROM password_reset_tokens WHERE token = ?', [resetToken]);
};

const validateResetToken = async (resetToken) => {
  const query = 'SELECT * FROM password_reset_tokens WHERE token = ? AND expires_at > NOW()';
  const values = [resetToken];

  try {
    const [rows] = await pool.execute(query, values);

    return rows.length > 0;
  } catch (error) {
    console.error('Error validating reset token:', error);
    return false;
  }
};

module.exports = router;

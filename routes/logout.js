// routes/logout.js
const express = require('express');
const router = express.Router();

// Logout handler
router.get('/', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error logging out:', err);
      res.status(500).send('Error logging out. Please try again.');
    } else {
      res.redirect('/login');
    }
  });
});

module.exports = router;

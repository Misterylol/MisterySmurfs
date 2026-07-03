// mainpage.js
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('Home', { activeTab: 'Home' });
});

module.exports = router;

// mainpage.js
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('FAQ', { activeTab: 'FAQ' });
});

module.exports = router;

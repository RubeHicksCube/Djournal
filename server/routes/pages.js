const express = require('express');
const path = require('path');
const router = express.Router();

// Serve login page
router.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'public', 'login.html'));
});

module.exports = router;
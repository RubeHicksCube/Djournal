const express = require('express');
const { validateUser } = require('../models/database');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

// Login endpoint
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const identifier = username; // This could be username or email
  
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Username/email and password required' });
  }

  const user = validateUser(identifier, password);
  
  if (user) {
    const token = generateToken(user);
    res.json({ 
      success: true, 
      token, 
      user: { id: user.id, username: user.username } 
    });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

module.exports = router;
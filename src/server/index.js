const express = require('express');
const { User } = require('../utils/database');
const path = require('path');
const { Telegraf } = require('telegraf');
const config = require('../config'); // Import configuration

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
app.use('/views', express.static(path.join(__dirname, '../views')));

// Initialize bot for notifications
const bot = new Telegraf(config.BOT_TOKEN);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Add route for thank you page
app.get('/thank-you', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/thank-you.html'));
});

// Add new endpoint for user registration
app.post('/api/register', async (req, res) => {
  try {
    const { fullName, telegramId, username, imagePath } = req.body;

    if (!fullName || !telegramId || !username) {
      return res.status(400).json({ error: 'Full name, Telegram ID, and username are required' });
    }

    // Check if username is already taken
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    // Create new user
    const user = await User.create({
      username,
      fullName,
      telegramId,
      imagePath: imagePath || null
    });

    res.json({
      success: true,
      username: user.username,
      fullName: user.fullName
    });
  } catch (error) {
    console.error('Error in /api/register:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Modify the main route to just serve the HTML file
app.get('/:username', async (req, res) => {
  const { username } = req.params;
  const user = await User.findOne({ username });

  if (!user) {
    return res.status(404).send('User not found');
  }

  res.sendFile(path.join(__dirname, '../views/index.html'));
});

// Add new endpoint to get user profile, using stored data
app.get('/api/:username/profile', async (req, res) => {
  const { username } = req.params;
  const user = await User.findOne({ username });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // If user has a Telegram file_id stored, get the file link
  let photoUrl = null;
  if (user.imagePath) {
    try {
      const fileLink = await bot.telegram.getFileLink(user.imagePath);
      photoUrl = fileLink.href;
    } catch (error) {
      console.error('Error getting file link:', error);
      // If there's an error getting the file link, photoUrl will remain null
    }
  }

  res.json({
    name: user.fullName || username,
    photoUrl: photoUrl
  });
});

// API endpoint to send message
app.post('/api/:username/messages', async (req, res) => {
  const { username } = req.params;
  const { message } = req.body;

  const user = await User.findOne({ username });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Send message directly to user in Telegram
  try {
    await bot.telegram.sendMessage(
      user.telegramId,
      `📬 You received a new anonymous message:\n\n${message}`
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Add new endpoint to update profile picture
app.post('/api/:username/update-profile', async (req, res) => {
  const { username } = req.params;
  const { imagePath } = req.body;

  if (!imagePath) {
    return res.status(400).json({ error: 'Image path is required' });
  }

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updated = await User.updateOne({ username }, { imagePath });
    if (updated) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Failed to update profile picture' });
    }
  } catch (error) {
    console.error('Error updating profile picture:', error);
    res.status(500).json({ error: 'Failed to update profile picture' });
  }
});

module.exports = app; 
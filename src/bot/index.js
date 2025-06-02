const { Telegraf, session, Markup } = require('telegraf');
const { User, readDB, writeDB } = require('../utils/database');
const axios = require('axios'); // Need to install axios: npm install axios
const path = require('path');
const config = require('../config'); // Import configuration

const bot = new Telegraf(config.BOT_TOKEN);

// Initialize session middleware with memory storage
bot.use(session({
  ttl: 600, // Session timeout in seconds
  defaultSession: () => ({ step: 'idle' }) // Initialize session with 'idle' step
}));

// Create menu keyboards
const createMainMenu = (hasAccount) => {
  if (hasAccount) {
    return Markup.keyboard([
      ['🔗 Get My Link', '🖼️ Change Photo'],
      ['❌ Delete Account', '❓ Help']
    ]).resize();
  } else {
    return Markup.keyboard([
      ['📝 Create Potro Link Page'],
      ['❓ Help']
    ]).resize();
  }
};

bot.start(async (ctx) => {
  const telegramId = ctx.from.id.toString();
  
  // Check if user already exists
  let user = await User.findOne({ telegramId });
  
  if (!user) {
    // If user doesn't exist, start registration process
    await ctx.reply('Welcome! To create your anonymous Potro Link page, please first tell me your full name.');
    ctx.session.step = 'waitingForFullName'; // Set state to waiting for full name
  } else {
    // If user exists, show their link
    await ctx.reply(`Your Potro Link page is available at: ${config.BASE_URL}/${user.username}`, createMainMenu(true));
    ctx.session.step = 'idle'; // Reset state
  }
});

// Handle button clicks
bot.hears('📝 Create Potro Link Page', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const user = await User.findOne({ telegramId });
  
  if (user) {
    await ctx.reply('You already have a Potro Link page. Use "🔗 Get My Link" to get your link.', createMainMenu(true));
    ctx.session.step = 'idle'; // Reset state
    return;
  }
  
  // Start registration process if no account exists
  await ctx.reply('To create your Potro Link page, please first tell me your full name.');
  ctx.session.step = 'waitingForFullName'; // Set state to waiting for full name
});

bot.hears('🔗 Get My Link', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const user = await User.findOne({ telegramId });
  
  if (!user) {
    await ctx.reply('Please choose a unique username for your Potro Link page:');
    ctx.session.step = 'waitingForUsername';
    return;
  }
  
  const url = `${config.BASE_URL}/${user.username}`;
  await ctx.reply(
    `Your Potro Link page is available at:\n<a href="${url}">${url}</a>`,
    { 
      parse_mode: 'HTML',
      ...createMainMenu(true)
    }
  );
});

bot.hears('❌ Delete Account', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const user = await User.findOne({ telegramId });
  
  if (!user) {
    await ctx.reply('No account found to delete.', createMainMenu(false));
    return;
  }
  
  try {
    const db = await readDB();
    const userIndex = db.users.findIndex(u => u.telegramId === telegramId);
    
    if (userIndex !== -1) {
      db.users.splice(userIndex, 1);
      await writeDB(db);
      await ctx.reply('Your account and all messages have been deleted.', createMainMenu(false));
    } else {
      await ctx.reply('Error: Account not found in database.', createMainMenu(false));
    }
  } catch (error) {
    console.error('Error deleting account:', error);
    await ctx.reply('An error occurred while deleting your account. Please try again.', createMainMenu(false));
  }
});

bot.hears('❓ Help', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const user = await User.findOne({ telegramId });
  const hasAccount = !!user;

  const helpText = hasAccount 
    ? 'Here\'s how to use this bot:\n\n' +
      '🔗 Get My Link - Get the link to your Potro Link page\n' +
      '🖼️ Change Photo - Change your profile picture\n' +
      '❌ Delete Account - Delete your account\n' +
      '❓ Help - Show this help message\n\n' +
      'Share your Potro Link page link with others to receive anonymous messages!'
    : 'Here\'s how to use this bot:\n\n' +
      '📝 Create Potro Link Page - Create your personal Potro Link page\n' +
      '🖼️ Change Photo - Change your profile picture\n' +
      '❓ Help - Show this help message\n\n' +
      'Start by creating your Potro Link page!';

  await ctx.reply(helpText, createMainMenu(hasAccount));
});

// Add new handler for Change Profile Picture button
bot.hears('🖼️ Change Photo', async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const user = await User.findOne({ telegramId });
    
    if (!user) {
        await ctx.reply('Please create a Potro Link page first.', createMainMenu(false));
        return;
    }
    
    ctx.session = {
        step: 'updatingProfilePicture',
        userId: user.id
    };
    
    await ctx.reply('Please send me your new profile picture. I will update it immediately.');
});

// Handle incoming photos
bot.on('photo', async (ctx) => {
    if (ctx.session.step === 'updatingProfilePicture') {
        const telegramId = ctx.from.id.toString();
        const photo = ctx.message.photo.pop();
        const fileId = photo.file_id;

        try {
            const user = await User.findOne({ telegramId });
            if (!user) {
                await ctx.reply('User not found. Please start over with /start', createMainMenu(false));
                ctx.session = { step: 'idle' };
                return;
            }

            const serverUrl = config.BASE_URL;
            const response = await fetch(`${serverUrl}/api/${user.username}/update-profile`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    imagePath: fileId
                }),
            });

            const data = await response.json();
            if (data.success) {
                await ctx.reply('Your profile picture has been updated successfully!', createMainMenu(true));
            } else {
                await ctx.reply('Sorry, there was an error updating your profile picture. Please try again.', createMainMenu(true));
            }
            ctx.session = { step: 'idle' };
        } catch (error) {
            console.error('Error handling profile image:', error);
            await ctx.reply('Sorry, there was an error processing your image. Please try again.');
        }
        return;
    }

    // Handle new user registration photo
    if (ctx.session.step === 'waitingForProfileImage') {
        const photo = ctx.message.photo.pop();
        ctx.session.imagePath = photo.file_id;
        ctx.session.step = 'waitingForUsername';
        await ctx.reply('Great! Now please choose a unique username for your Potro Link Letter page.');
    }
});

// Handle incoming text messages (Full Name and Username)
bot.on('text', async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const messageText = ctx.message.text;

    // Check if the message is a recognized command or button text
    if (['🔗 Get My Link', '❌ Delete Account', '❓ Help', '📝 Create Potro Link Page', '🖼️ Change Photo'].includes(messageText)) {
        return;
    }

    switch (ctx.session.step) {
        case 'waitingForFullName':
            // Received full name
            const fullName = messageText.trim();
            if (fullName.length < 2) {
                await ctx.reply('Please provide your full name.');
                return;
            }
            ctx.session.fullName = fullName; // Store full name in session
            ctx.session.step = 'waitingForProfileImage'; // Move to next step
            await ctx.reply(`Thank you, ${fullName}! Please send me a profile image for your Letter page.`);
            break;

        case 'updatingProfilePicture':
            await ctx.reply('Please send me a photo to update your profile picture.');
            break;

        case 'waitingForProfileImage':
            await ctx.reply('Please send me a photo for your profile image. This is required.');
            break;

        case 'waitingForUsername':
            // Received username
            const username = messageText.trim();

            // Validate username
            if (username.length < 3) {
                await ctx.reply('Username must be at least 3 characters long. Please try again:');
                return;
            }

            if (!/^[a-zA-Z0-9_]+$/.test(username)) {
                await ctx.reply('Username can only contain letters, numbers, and underscores. Please try again:');
                return;
            }

            try {
                // Check if username is already taken
                const existingUser = await User.findOne({ username });
                if (existingUser) {
                    await ctx.reply('This username is already taken. Please choose another one:');
                    return;
                }

                // Get full name and image path from session
                const storedFullName = ctx.session.fullName;
                const storedImagePath = ctx.session.imagePath || null;

                if (!storedFullName) {
                    await ctx.reply('An error occurred. Please start over with /start.');
                    ctx.session.step = 'idle';
                    delete ctx.session.fullName;
                    delete ctx.session.imagePath;
                    return;
                }

                // Use the /api/register endpoint with dynamic URL
                const serverUrl = config.BASE_URL;
                const response = await fetch(`${serverUrl}/api/register`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 
                        fullName: storedFullName, 
                        telegramId: telegramId, 
                        username: username, 
                        imagePath: storedImagePath 
                    }),
                });

                const data = await response.json();

                if (data.success) {
                    await ctx.reply(`Great! Your Potro Link page is now available at: ${serverUrl}/${data.username}`, createMainMenu(true));
                    ctx.session.step = 'idle';
                    delete ctx.session.fullName;
                    delete ctx.session.imagePath;
                } else {
                    console.error('Server registration error:', data.error);
                    await ctx.reply('An error occurred during registration. Please try again.', createMainMenu(false));
                    ctx.session.step = 'idle';
                    delete ctx.session.fullName;
                    delete ctx.session.imagePath;
                }

            } catch (error) {
                console.error('Error during registration process:', error);
                await ctx.reply('An error occurred. Please try again.', createMainMenu(false));
                ctx.session.step = 'idle';
                delete ctx.session.fullName;
                delete ctx.session.imagePath;
            }
            break;

        default:
            // If the user sends text while not in a specific state, ignore or reply with help
            // console.log(`Received text in idle state: ${messageText}`);
            // await ctx.reply('I didn't understand that. Use the menu buttons or type /start.');
            break;
    }
});

// Add handler for Menu button
bot.hears('☰ Menu', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const user = await User.findOne({ telegramId });
  
  if (user) {
    await ctx.reply('Main Menu:', createMainMenu(true));
  } else {
    await ctx.reply('Main Menu:', createMainMenu(false));
  }
});

module.exports = bot; 
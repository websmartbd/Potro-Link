const fs = require('fs').promises;
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/db.json');

// Ensure the data directory exists
async function ensureDataDir() {
  const dataDir = path.join(__dirname, '../../data');
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir);
  }
}

// Initialize database
async function initDB() {
  await ensureDataDir();
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify({ users: [] }));
  }
}

// Read database
async function readDB() {
  const data = await fs.readFile(DB_PATH, 'utf8');
  return JSON.parse(data);
}

// Write to database
async function writeDB(data) {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
}

// User operations
const User = {
  async findOne(query) {
    const db = await readDB();
    return db.users.find(user => 
      Object.keys(query).every(key => user[key] === query[key])
    );
  },

  async create(userData) {
    const db = await readDB();
    const user = {
      telegramId: userData.telegramId,
      username: userData.username,
      fullName: userData.fullName,
      imagePath: userData.imagePath || null,
      id: Date.now().toString()
    };
    db.users.push(user);
    await writeDB(db);
    return user;
  },

  async updateOne(query, update) {
    const db = await readDB();
    const index = db.users.findIndex(user => 
      Object.keys(query).every(key => user[key] === query[key])
    );
    if (index !== -1) {
      db.users[index] = { ...db.users[index], ...update };
      await writeDB(db);
      return true;
    }
    return false;
  },

  async deleteOne(query) {
    const db = await readDB();
    const index = db.users.findIndex(user => 
      Object.keys(query).every(key => user[key] === query[key])
    );
    if (index !== -1) {
      db.users.splice(index, 1);
      await writeDB(db);
      return true;
    }
    return false;
  }
};

module.exports = {
  initDB,
  User,
  readDB,
  writeDB
}; 
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const db = require('../db'); // Import your MySQL database configuration

const sessionStore = new MySQLStore({
  expiration: 86400000, // Set the session expiration time (in milliseconds) - 1 day in this example
  createDatabaseTable: true, // Automatically create the sessions table if it doesn't exist
}, db);

module.exports = sessionStore;

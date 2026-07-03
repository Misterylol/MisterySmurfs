const express = require('express');
const app = express();
const dotenv = require('dotenv');
dotenv.config({ path: 'db.env' });
const port = process.env.PORT || 3000;
const path = require('path');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const session = require('express-session');
const stripeWebhook = require('./routes/stripe-webhook');
const sessionMiddleware = require('./middleware/sessionMiddleware');
const userMiddleware = require('./middleware/userMiddleware');
const errorMiddleware = require('./middleware/errorMiddleware');


// Set view engine and views path
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.set('trust proxy', 1);
app.use(bodyParser.urlencoded({ extended: false }));

app.use(stripeWebhook);

app.use(session({
  secret: process.env.SESSION_SECRET_KEY,
  resave: false,
  saveUninitialized: false,
  store: sessionMiddleware,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 604800000, // 7 days
  },
}));

app.use(userMiddleware);
app.use(helmet());
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      scriptSrc: ["'self'", 'code.jquery.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'],
      styleSrc: ["'self'", 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'],
      imgSrc: ["'self'", 'raw.communitydragon.org'],
    },
  })
);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Route handlers
const homeRoute = require('./routes/Home');
const registerRoute = require('./routes/register');
const loginRoute = require('./routes/login');
const forgotRoute = require('./routes/forgot-password');
const resetRoute = require('./routes/reset-password');
const logoutRoute = require('./routes/logout');
const faqRoute = require('./routes/FAQ');
const smurfAccountsRoute = require('./routes/SmurfAccounts');

const cartRoute = require('./routes/Cart');
const myPurchases = require('./routes/myPurchases');

app.use('/', homeRoute);
app.use('/register', registerRoute);
app.use('/login', loginRoute);
app.use('/forgot-password', forgotRoute);
app.use('/reset-password', resetRoute);
app.use('/logout', logoutRoute);
app.use('/FAQ', faqRoute);
app.use('/SmurfAccounts', smurfAccountsRoute);

app.use('/Cart', cartRoute);
app.use('/myPurchases', myPurchases);

// Error handling middleware
app.use(errorMiddleware);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

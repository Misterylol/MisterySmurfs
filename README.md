# MisterySmurfs

MisterySmurfs is a full-stack e-commerce application built with Node.js, Express, MySQL and EJS. It supports user registration, login, product browsing, carts, Stripe checkout, purchase history, and email delivery for order and password-reset flows.

## Features

- User registration and login with hashed passwords using bcrypt.
- Session persistence backed by MySQL.
- Product listing and shopping cart flows for digital account products.
- Stripe Checkout integration with webhook-based order fulfilment.
- Email notifications using Nodemailer.
- Password reset flow with expiring reset tokens.
- Security middleware including Helmet, Content Security Policy and route rate limiting.
- Server-rendered UI with EJS, Tailwind CSS and Bootstrap assets.

## Tech Stack

- **Backend:** Node.js, Express
- **Database:** MySQL with `mysql2`
- **Views:** EJS
- **Styling:** Tailwind CSS, Bootstrap
- **Payments:** Stripe Checkout and webhooks
- **Email:** Nodemailer
- **Security:** bcrypt, express-session, express-mysql-session, Helmet, express-rate-limit

## Getting Started

### Prerequisites

- Node.js 18 or later
- MySQL
- Stripe account and webhook secret
- Email provider credentials or app password

### Installation

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example db.env
```

Fill in the required database, Stripe, session and email values in `db.env`.

Start the application:

```bash
npm start
```

For local development, install Nodemon and run:

```bash
npm install --save-dev nodemon
npm run dev
```

The app runs on `http://localhost:3000` by default.

## Environment Variables

| Variable | Description |
| --- | --- |
| `PORT` | Local server port. |
| `APP_BASE_URL` | Public base URL used for redirects and email links. |
| `DB_HOST` | MySQL host. |
| `DB_PORT` | MySQL port. |
| `DB_USER` | MySQL username. |
| `DB_PASSWORD` | MySQL password. |
| `DB_NAME` | MySQL database name. |
| `SESSION_SECRET_KEY` | Secret used to sign session cookies. |
| `STRIPE_SECRET_KEY` | Stripe secret API key. |
| `WEBHOOK_SECRET_KEY` | Stripe webhook signing secret. |
| `USER_EMAIL` | Sender email address for transactional messages. |
| `PASSWORD_EMAIL` | Email app password or SMTP credential. |

## Notes

This project was built as a practical full-stack e-commerce application and portfolio project. Sensitive values are intentionally excluded from Git; use `.env.example` as the template for local configuration.

See [docs/database.md](docs/database.md) for the database tables expected by the application.

# Database Reference

The application expects a MySQL database. The exact production schema may include additional fields, but the routes use the tables and columns below.

## Core Tables

### `users`

| Column | Purpose |
| --- | --- |
| `id` | Primary key used for sessions, carts and purchases. |
| `username` | Login identifier. |
| `email` | Account email and password-reset lookup. |
| `password` | bcrypt-hashed password. |

### `password_reset_tokens`

| Column | Purpose |
| --- | --- |
| `user_id` | User requesting the reset. |
| `token` | Random reset token sent by email. |
| `expires_at` | Token expiry timestamp. |

### `smurfaccounts`

| Column | Purpose |
| --- | --- |
| `id` | Product/account identifier. |
| `username` | Purchased account username, sent after payment. |
| `password` | Purchased account password, sent after payment. |
| `price` | Product price in EUR. |
| `blueessence` | Blue essence filter/sort value. |
| `region` | Account region. |
| `level` | Account level. |
| `skinids` | Skin ID list used to enrich product cards. |
| `purchaseStatus` / `purchasestatus` | Availability flag used by existing queries. |

### `cart`

| Column | Purpose |
| --- | --- |
| `user_id` | User who owns the cart item. |
| `account_id` | Account/product in the cart. |

### `purchased_accounts`

| Column | Purpose |
| --- | --- |
| `user_id` | Purchaser. |
| `account_id` | Purchased account. |
| `amount` | Amount paid for the account. |
| `email` | Customer email from Stripe. |
| `purchase_date` | Purchase timestamp used by purchase history. |

## RP Order Tables

### `RP`

| Column | Purpose |
| --- | --- |
| `id` | RP product identifier. |
| `name` | RP package name. |

### `orders_rp`

| Column | Purpose |
| --- | --- |
| `user_id` | Purchaser. |
| `email` | Customer email from Stripe. |
| `product_id` | RP package ID. |
| `summoners_id` | Customer summoner identifier. |
| `status` | Order processing status. |
| `price` | Amount paid. |
| `partner_profit` | Partner commission value. |
| `partner` | Partner identifier. |

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const express = require('express');
const router = express.Router();
const endpointSecret = (process.env.WEBHOOK_SECRET_KEY);
const pool = require('../db');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  secure: true,
  port: 587,
  auth: {
    user: process.env.USER_EMAIL,
    pass: process.env.PASSWORD_EMAIL,
  },
});

router.post('/stripe-webhook', bodyParser.raw({type: 'application/json'}), async (request, res) => {
  const payload = request.body;
  const sig = request.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.async_payment_failed':
      const checkoutSessionAsyncPaymentFailed = event.data.object;
      break;
    case 'checkout.session.async_payment_succeeded':
      const checkoutSessionAsyncPaymentSucceeded = event.data.object;
      break;
    case 'checkout.session.completed':
      const checkoutSessionCompleted = event.data.object;
      const productType = checkoutSessionCompleted.metadata.productType;
      // Determine the product type and call the corresponding handling function
      switch (productType) {
        case 'type1':
          await handleType1CompletedPayment(checkoutSessionCompleted, res);
          break;
        case 'type2':
          await handleType2CompletedPayment(checkoutSessionCompleted, res);
          break;
        default:
          return res.status(400).json({ message: 'Invalid product type' });
      }
      break;
    default:
  }

  res.status(200).end();
});

const handleType1CompletedPayment = async (checkoutSessionCompleted, res) => {
  const itemIds = checkoutSessionCompleted.metadata.accountIds;
  const totalPrice = checkoutSessionCompleted.amount_total;
  const userId = checkoutSessionCompleted.client_reference_id;
  const email = checkoutSessionCompleted.customer_details.email;
  if (!userId) {
    return res.status(400).json({ message: 'User ID is missing in the session or payment data' });
  }
  
  if (itemIds) {
    try {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const itemIdsArray = itemIds.split(',').map(itemId => parseInt(itemId, 10));
        const accountDetails = [];
        const unavailableItems = [];

        for (const itemId of itemIdsArray) {
          const price = totalPrice / 100;

          const checkAvailabilityQuery = 'SELECT id, username, password FROM smurfaccounts WHERE id = ? AND purchasestatus = FALSE';
          const [availableItem] = await connection.execute(checkAvailabilityQuery, [itemId]);

          if (availableItem.length === 0) {
            unavailableItems.push(itemId); // Add unavailable item to the list
            continue; // Skip further processing for this item
          }

          const updatePurchaseStatusQuery = 'UPDATE smurfaccounts SET purchasestatus = TRUE WHERE id = ?';
          const removeItemFromCartQuery = 'DELETE FROM cart WHERE account_id = ?';
          await connection.execute(updatePurchaseStatusQuery, [itemId]);
          await connection.execute(removeItemFromCartQuery, [itemId]);

          const insertPurchaseRecordQuery = 'INSERT INTO purchased_accounts (user_id, account_id, amount, email) VALUES (?, ?, ?, ?)';
          await connection.execute(insertPurchaseRecordQuery, [userId, itemId, price, email]);

          accountDetails.push({ username: availableItem[0].username, password: availableItem[0].password });
        }

        await connection.commit();
        connection.release();

        sendPurchaseConfirmationEmail(email, accountDetails);

        if (unavailableItems.length > 0) {
          return res.status(400).json({ message: 'Some items are not available for purchase.', unavailableItems });
        } else {
          return res.status(200).json({ message: 'Order submitted successfully' });
        }
      } catch (error) {
        await connection.rollback();
        connection.release();
        throw error;
      }
    } catch (error) {
      console.error('Error handling successful payment:', error);
      return res.status(500).json({ error: 'An error occurred while processing the order' });
    }
  } else {
    return res.status(200).json({ message: 'No line items in the payment event' });
  }
};


const handleType2CompletedPayment = async (checkoutSessionCompleted, res) => {
  const productId = checkoutSessionCompleted.metadata.product_id;
  const username = checkoutSessionCompleted.metadata.username;
  const partnerProfit = checkoutSessionCompleted.metadata.partnerProfit;
  const partner = checkoutSessionCompleted.metadata.partner;
  const totalPrice = checkoutSessionCompleted.amount_total;
  const userId = checkoutSessionCompleted.client_reference_id;
  const email = checkoutSessionCompleted.customer_details.email;
  const price = totalPrice / 100;

  const connection = await pool.getConnection();
  try {
    const [productRows] = await connection.query('SELECT name FROM RP WHERE id = ?', [productId]);
    if (productRows.length === 0) {
      throw new Error('Product not found');
    }
    const productName = productRows[0].name;

    await connection.query(
      `INSERT INTO orders_rp (user_id, email, product_id, summoners_id, status, price, partner_profit, partner) VALUES (?, ?, ?, ?, 'Pending', ?, ?, ?)`,
      [userId, email, productId, username, price, partnerProfit, partner]
    );

    sendPurchaseConfirmationEmail2(email, productId, username, price);

    res.status(200).send("Payment completed successfully!");
  } catch (error) {
    console.error("Error occurred during payment completion:", error);
    res.status(500).send("Error occurred during payment completion");
  } finally {
    connection.release();
  }
};

const sendPurchaseConfirmationEmail2 = async (recipientEmail, productId, username, price) => {
  const connection = await pool.getConnection();
  
  try {
    const [rows] = await connection.query('SELECT name FROM RP WHERE id = ?', [productId]);
    
    const productName = rows[0].name;

    const mailOptions = {
      from: process.env.USER_EMAIL,
      to: recipientEmail,
      subject: 'MisterySmurfs Purchase - Your RP Purchase Details',
      text: `Thank you for your RP purchase!\n\nRP Amount: ${productName}\nUsername: ${username}\nPrice: ${price.toFixed(2)} EUR\n\nYour RP order has been received and will be processed shortly.\n\nThank you for choosing MisterySmurfs!`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error sending email:', error);
      }
    });
  } catch (error) {
    console.error('Error fetching product name:', error);
  } finally {
    connection.release();
  }
};



const sendPurchaseConfirmationEmail = (recipientEmail, accountDetails) => {
  const accountList = accountDetails.map(account => `Username: ${account.username}\nPassword: ${account.password}`).join('\n\n');

  const mailOptions = {
    from: process.env.USER_EMAIL,
    to: recipientEmail,
    subject: 'MisterySmurfs Purchase - Your Smurf Account Details',
    text: `Thank you for your purchase!\n\n${accountList}\n\nEnjoy your new Smurf accounts!`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error);
    }
  });
};

module.exports = router;

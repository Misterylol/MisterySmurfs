// mainpage.js
const express = require('express');
const router = express.Router();
const pool = require('../db');
const axios = require('axios');
const crypto = require('crypto');

const ACCOUNTS_PER_PAGE = 10; // Adjust this based on your preference

router.get('/', async (req, res) => {
  try {
    // Check if a user is authenticated and exists in the session
    if (!req.session.user) {
      res.redirect('/login'); // Redirect to login page if not authenticated
      return;
    }
    const nonce = crypto.randomBytes(16).toString('base64');
    
    // Set the CSP header for this response with the nonce
    res.setHeader('Content-Security-Policy', `script-src 'self' code.jquery.com cdn.jsdelivr.net cdnjs.cloudflare.com 'nonce-${nonce}'; style-src 'self' cdn.jsdelivr.net cdnjs.cloudflare.com; object-src 'none'; base-uri 'self'; frame-src 'self';`);
    // Get the page number from the query parameters, default to 1 if not provided
    const currentPage = parseInt(req.query.page, 10) || 1;

    // Fetch user's completed purchases with pagination
    const userId = req.session.user.id;
    const { accountsPurchased, totalAccounts } = await getMyPurchasesWithPagination(userId, currentPage);

    accountsPurchased.forEach((purchase) => {
      purchase.formattedDate = formatPurchaseDate(purchase.purchase_date);
    });

    // Calculate the total number of pages
    const totalPages = Math.ceil(totalAccounts / ACCOUNTS_PER_PAGE);

    // Fetch account details for each purchased account
    const accountIds = accountsPurchased.map((purchase) => purchase.account_id);
    const accountsDetails = await getAccountDetailsBulk(accountIds);

    const orders_rp = await getRpOrders(userId)

    orders_rp.forEach((purchase) => {
      purchase.formattedDate = formatPurchaseDate(purchase.purchase_date);
    });

    // Render the "My Purchases" page with pagination information
    res.render('myPurchases', {
      activeTab: 'myPurchases',
      accountsPurchased: accountsPurchased,
      accountsDetails: accountsDetails,
      totalPages: totalPages,
      currentPage: currentPage,
      orders_rp: orders_rp,
      nonce: nonce,
    });
  } catch (error) {
    // Handle any errors, e.g., by rendering an error page
    console.error('Error fetching user purchases:', error);
    res.render('error', { errorMessage: 'An error occurred while fetching user purchases.' });
  }
});

async function getRpOrders(userId) {
  try {
    const cartQuery = `
    SELECT sa.product_id, pa.name, sa.purchase_date, sa.summoners_id, sa.status, sa.price
    FROM orders_rp sa
    JOIN RP pa ON sa.product_id = pa.id
    WHERE sa.user_id = ?
    ORDER BY sa.purchase_date DESC;
  `;
  

    const [accountsResponse] = await pool.query(cartQuery, [userId]);
    return accountsResponse;
  } catch (error) {
    throw error;
  }
}



// Add this function to your existing code
// Function to format the purchase date
function formatPurchaseDate(dateString) {
  const options = { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', timeZoneName: 'short' };
  const formattedDate = new Intl.DateTimeFormat('en-US', options).format(new Date(dateString));
  return formattedDate;
}

// Function to fetch user's completed purchases with pagination
async function getMyPurchasesWithPagination(userId, page) {
  try {
    // Calculate the offset to fetch the appropriate range of accounts
    const offset = (page - 1) * ACCOUNTS_PER_PAGE;

    // Query the database to fetch a range of user's completed purchases
    const purchasesQuery = 'SELECT * FROM purchased_accounts WHERE user_id = ? ORDER BY purchase_date DESC LIMIT ? OFFSET ?';
    const [purchasesResponse] = await pool.query(purchasesQuery, [userId, ACCOUNTS_PER_PAGE, offset]);

    // Query to get the total number of user's completed purchases
    const countQuery = 'SELECT COUNT(*) AS total FROM purchased_accounts WHERE user_id = ?';
    const [countResponse] = await pool.execute(countQuery, [userId]);
    const totalAccounts = countResponse[0].total;

    // Return the purchases data and total number of accounts
    return { accountsPurchased: purchasesResponse, totalAccounts: totalAccounts };
  } catch (error) {
    throw error;
  }
}

// Function to fetch details for a specific account
async function getAccountDetailsBulk(accountIds) {
  try {
      if (!Array.isArray(accountIds) || accountIds.length === 0) {
        return {
          accountsInCart: [],
          totalPrice: 0, // Initialize total price to 0
        };
      }

      const cartQuery = `
        SELECT sa.username, sa.price, sa.blueessence, sa.region, sa.level, sa.skinids, pa.purchase_date
        FROM smurfaccounts sa
        JOIN purchased_accounts pa ON sa.id = pa.account_id
        WHERE sa.id IN (?)
        AND sa.purchaseStatus = TRUE
        ORDER BY pa.purchase_date DESC;
      `;

      const [accountsResponse] = await pool.query(cartQuery, [accountIds]);
      const accountsInCart = accountsResponse;

      // Fetch skin data from an external source
      const skinDataResponse = await axios.get('https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/skins.json');
      const skinData = skinDataResponse.data;

      // Iterate through the accounts and process skin data
      for (const account of accountsInCart) {
          let highestRarityValue = 0;
          let highestRarityName = '';
          const skinIds = account.skinids;
          const skinNames = [];

          if (Array.isArray(skinIds)) {
              for (const skinId of skinIds) {
                  const skinInfo = skinData[skinId];
                  if (skinInfo) {
                      const rarityValue = getRarityValue(skinInfo.rarity);
                      skinNames.push(skinInfo.name);
                      if (rarityValue > highestRarityValue) {
                          highestRarityValue = rarityValue;
                          highestRarityName = skinInfo.name;
                      }
                  }
              }
          }
          account.highestRarityName = highestRarityName;
          account.skinNames = skinNames;
          account.blueEssenceFormatted = (account.blueessence >= 10000) ? (Math.floor(account.blueessence / 10000) * 10000 + '+') : '<10,000';
      }
      return accountsInCart;
  } catch (error) {
      throw error;
  }
}

function getRarityValue(rarityName) {
  switch (rarityName) {
    case 'kNoRarity':
      return 1;
    case 'kEpic':
      return 2;
    case 'kLegendary':
      return 3;
    case 'kMythic':
      return 4;
    default:
      return 0;
  }
}


module.exports = router;

const express = require('express');
const router = express.Router();
const pool = require('../db');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';

const CartLimiter = rateLimit({
  windowMs: 750,
  max: 1,
  message: 'You have exceeded the rate limit. Please wait and try again.',
});

router.get('/', async (req, res) => {
    try {
        if (!req.session.user) {
            res.redirect('/login');
            return;
        }

        const nonce = crypto.randomBytes(16).toString('base64');
    
        res.setHeader('Content-Security-Policy', `script-src 'self' code.jquery.com cdn.jsdelivr.net cdnjs.cloudflare.com 'nonce-${nonce}'; style-src 'self' cdn.jsdelivr.net cdnjs.cloudflare.com; object-src 'none'; base-uri 'self'; frame-src 'self';`);

        res.render('Cart', {
            activeTab: 'Cart',
            nonce: nonce,
        });
    } catch (error) {
        res.render('error', { errorMessage: 'An error occurred while fetching cart items.' });
    }
});

router.get('/get-cart', async (req, res) => {
    try {
      if (!req.session.user) {
          res.status(401).send('Unauthorized');
          return;
      }

      const userId = req.session.user.id;
      const cartItemIds = await getCartItemIdsForUser(userId);
      const accountsInCart = await getAccountsInCart(cartItemIds);
      const cartItems = accountsInCart.accountsInCart;
      const totalPrice = accountsInCart.totalPrice;

      res.render('partials/cartItems', { cartItems, totalPrice }, (err, html) => {
        if (err) {
          res.status(500).json({ error: 'An error occurred while rendering the cart items.' });
        } else {
          res.status(200).send(html);
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'An error occurred while fetching cart items.' });
    }
});


router.post('/add-to-cart', CartLimiter, async (req, res) => {

  if (req.rateLimit.remaining < 0) {
    return res.status(429).send('Rate limit exceeded. Please wait and try again later.');
  }
  if (!req.session.user) {
    res.status(401).send('Unauthorized');
    return;
  }

  const userId = req.session.user.id;
  const itemId = req.body.itemId;

  const checkCartItemQuery = 'SELECT * FROM cart WHERE user_id = ? AND account_id = ?';
  try {
    const [existingRows, existingFields] = await pool.execute(checkCartItemQuery, [userId, itemId]);

    if (existingRows.length > 0) {
      res.status(409).send('Item already exists in the cart');
      return;
    }

    const countItemsInCartQuery = 'SELECT COUNT(*) AS itemCount FROM cart WHERE user_id = ?';
    const [countItemsRows, countItemsFields] = await pool.execute(countItemsInCartQuery, [userId]);
    const itemCount = countItemsRows[0].itemCount;

    if (itemCount >= 8) {
      res.status(400).send('Cart is full. Maximum of 8 items allowed');
      return;
    }

    const checkPurchaseStatusQuery = 'SELECT purchasestatus FROM smurfaccounts WHERE id = ?';
    const [purchaseStatusRows, purchaseStatusFields] = await pool.execute(checkPurchaseStatusQuery, [itemId]);

    if (purchaseStatusRows.length === 0) {
      res.status(404).send('Account not found');
      return;
    }

    if (purchaseStatusRows[0].purchasestatus === 1) {
      res.status(403).send('Account has already been purchased');
      return;
    }

    const addToCartQuery = 'INSERT INTO cart (user_id, account_id) VALUES (?, ?)';
    try {
      const [result, fields] = await pool.execute(addToCartQuery, [userId, itemId]);
      res.status(200).send('Item added to the cart');
    } catch (error) {
      console.error(error);
      res.status(500).send('Error adding item to the cart');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Error checking for existing items in the cart');
  }
});

  
router.delete('/remove-from-cart', CartLimiter, async (req, res) => {

    if (req.rateLimit.remaining < 0) {
      return res.status(429).send('Rate limit exceeded. Please wait and try again later.');
    }
    if (!req.session.user) {
      res.status(401).send('Unauthorized');
      return;
    }
  
    const userId = req.session.user.id;
    const itemId = req.body.itemId;
  
    const checkCartItemQuery = 'SELECT * FROM cart WHERE user_id = ? AND account_id = ?';
    try {
      const [existingRows, existingFields] = await pool.execute(checkCartItemQuery, [userId, itemId]);
  
      if (existingRows.length === 0) {
        res.status(404).send('Item not found in the cart');
        return;
      }
  
      const removeFromCartQuery = 'DELETE FROM cart WHERE user_id = ? AND account_id = ?';
      try {
        const [result, fields] = await pool.execute(removeFromCartQuery, [userId, itemId]);
        
        res.status(200).send('Item removed from the cart');
      } catch (error) {
        console.error(error);
        res.status(500).send('Error removing item from the cart');
      }
    } catch (error) {
      console.error(error);
      res.status(500).send('Error checking for existing items in the cart');
    }
});
  
router.post('/submit-order', CartLimiter, async (req, res) => {
  if (req.rateLimit.remaining < 0) {
    return res.status(429).send('Rate limit exceeded. Please wait and try again later.');
  }

  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = req.session.user.id;

    const getCartItemsQuery = 'SELECT account_id FROM cart WHERE user_id = ?';
    const [cartItemsRows, cartItemsFields] = await pool.execute(getCartItemsQuery, [userId]);

    if (cartItemsRows.length === 0) {
      return res.status(400).json({ error: 'No items in the cart to submit an order' });
    }

    const itemIds = cartItemsRows.map((item) => item.account_id);

    for (const itemId of itemIds) {
      const checkPurchaseStatusQuery = 'SELECT purchasestatus FROM smurfaccounts WHERE id = ?';
    
      const [purchaseStatusRows] = await pool.execute(checkPurchaseStatusQuery, [itemId]);
      if (purchaseStatusRows[0].purchasestatus === 1) {
        return res.status(400).json({ error: 'Account is no longer available for purchase' });
      }
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const couponCode = req.body.appliedCoupon;
      const couponDetails = await checkCoupon(couponCode);
      const discounts = couponDetails ? [{ coupon: couponDetails.id }] : [];

      const lineItems = [];

      for (const itemId of itemIds) {
        const totalItemsPriceQuery = 'SELECT price FROM smurfaccounts WHERE id = ?';
        const [totalPriceRows, totalPriceFields] = await pool.execute(totalItemsPriceQuery, [itemId]);
        totalPriceRows.forEach((row) => {
          const price = parseFloat(row.price);

          lineItems.push({
            price_data: {
              currency: 'eur',
              product_data: {
                name: 'Smurf Account',
                metadata: { itemId },
              },
              unit_amount: Math.round(price * 100),
            },
            quantity: 1,
          });
        });
      }

      const itemIdsAsString = itemIds.join(',');
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const expirationTime = currentTimestamp + 1800;
      
      const session = await stripe.checkout.sessions.create({
        client_reference_id: userId,
        payment_method_types: ['card', 'ideal', 'bancontact', 'eps', 'giropay', 'klarna', 'p24'],
        line_items: lineItems,
        metadata: {
          accountIds: itemIdsAsString,
          productType: 'type1',
        },
        discounts: discounts,
        mode: 'payment',
        success_url: `${appBaseUrl}/myPurchases`,
        cancel_url: `${appBaseUrl}/Cart`,
        expires_at: expirationTime,
      });

      await connection.commit();
      connection.release();

      res.redirect(303, session.url);
    } catch (error) {
      await connection.rollback();
      connection.release();
      console.error('Error in submit-order route:', error);
      return res.status(500).json({ error: 'An error occurred while processing the order' });
    }
  } catch (error) {
    console.error('Error in submit-order route:', error);
    return res.status(500).json({ error: 'An error occurred' });
  }
});

router.post('/check-coupon', CartLimiter, async (req, res) => {
  if (req.rateLimit.remaining < 0) {
    return res.status(429).send('Rate limit exceeded. Please wait and try again later.');
  }
  const { couponCode } = req.body;

  if (!couponCode) {
    return res.status(400).send('Please provide a coupon.');
  }

  try {
    const promotionCodes = await stripe.promotionCodes.list({
      limit: 1,
      code: couponCode,
    });

    if (promotionCodes.data.length > 0) {
      const promotionCode = promotionCodes.data[0];

      const coupon = await stripe.coupons.retrieve(promotionCode.coupon.id);

      res.json({
        couponName: promotionCode.code,
        percentOff: coupon.percent_off,
      });
    } else {
      res.status(400).send('Invalid coupon code');
    }
  } catch (error) {
    console.error('Error checking coupon:', error);
    res.status(500).send('Coupon invalid.');
  }
});

const checkCoupon = async (couponCode) => {
  try {
    if (!couponCode) {
      return null;
    }

    const promotionCodes = await stripe.promotionCodes.list({
      limit: 1,
      code: couponCode,
    });
    if (promotionCodes.data.length > 0) {
      const promotionCode = promotionCodes.data[0];

      const coupon = await stripe.coupons.retrieve(promotionCode.coupon.id);

      if (coupon.valid) {
        return {
          id: coupon.id,
        };
      } else {
        return null;
      }
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error checking coupon:', error);
    throw error;
  }
};


async function getCartItemIdsForUser(userId) {
    try {
        const cartItemIdsQuery = 'SELECT account_id FROM cart WHERE user_id = ?';
        const [cartItemIdsResponse] = await pool.execute(cartItemIdsQuery, [userId]);

        const cartItemIds = cartItemIdsResponse.map(item => item.account_id);
        return cartItemIds;
    } catch (error) {
        throw error;
    }
}
  async function getAccountsInCart(accountIds) {
    try {
        if (!Array.isArray(accountIds) || accountIds.length === 0) {
          return {
            accountsInCart: [],
            totalPrice: 0,
          };
        }

        const cartQuery = `
            SELECT id, price, blueessence, region, level, skinids
            FROM smurfaccounts
            WHERE id IN (?)
            AND purchaseStatus = FALSE;
        `;

        const [accountsResponse] = await pool.query(cartQuery, [accountIds]);
        const accountsInCart = accountsResponse;

        const skinDataResponse = await axios.get('https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/skins.json');
        const skinData = skinDataResponse.data;

        let totalPrice = 0;

        for (const account of accountsInCart) {
            let highestRarityValue = 0;
            let highestRarityTilePath = '';
            let highestRarityTilePath0 = '';
            let highestRarityName = '';
            const skinIds = account.skinids;
            const skinNames = [];

            if (Array.isArray(skinIds)) {
                for (const skinId of skinIds) {
                    const skinInfo = skinData[skinId];
                    const championID = skinId.replace(/\d{3}$/, '000');
                    const championID0 = championID.replace(/000$/, '');
                    if (skinInfo) {
                        const rarityValue = getRarityValue(skinInfo.rarity);
                        skinNames.push(skinInfo.name);
                        
                        if (rarityValue > highestRarityValue) {
                            highestRarityValue = rarityValue;
                            highestRarityTilePath = extractChampionTilesPath(skinInfo.tilePath);
                            highestRarityTilePath0 = "/champion-tiles/" + championID0 + "/" + skinId + ".jpg";
                            highestRarityName = skinInfo.name;
                        }
                    }
                }
            }
            account.highestRarityName = highestRarityName;
            account.highestRarityTilePath = highestRarityTilePath;
            account.highestRarityTilePath0 = highestRarityTilePath0;
            account.skinNames = skinNames;
            account.blueEssenceFormatted = (account.blueessence >= 10000) ? (Math.floor(account.blueessence / 10000) * 10000 + '+') : '<10,000';
            totalPrice += parseFloat(account.price);
        }

        return {
          accountsInCart,
          totalPrice,
      };
    } catch (error) {
        throw error;
    }
  }

  function extractChampionTilesPath(tilePath) {
    const startIndex = tilePath.indexOf('champion-tiles');
    if (startIndex !== -1) {
      return tilePath.substring(startIndex); // Extract from "champion-tiles" to the end
    }
    return tilePath;
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

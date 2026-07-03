const express = require('express');
const router = express.Router();
const pool = require('../db');
const axios = require('axios');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const filterLimiter = rateLimit({
  windowMs: 1000,
  max: 1,
  message: 'You have exceeded the rate limit for adding items to the cart. Please wait and try again.',
});

router.get('/', async (req, res) => {
  try {
    const championList = await getChampionList();
    const skinList = await getSkinsList();

    const nonce = crypto.randomBytes(16).toString('base64');
    
    res.setHeader('Content-Security-Policy', `script-src 'self' code.jquery.com cdn.jsdelivr.net cdnjs.cloudflare.com 'nonce-${nonce}'; style-src 'self' cdn.jsdelivr.net cdnjs.cloudflare.com; object-src 'none'; base-uri 'self'; frame-src 'self';`);

    res.render('SmurfAccounts', {
      activeTab: 'SmurfAccounts',
      championList,
      skinList,
      nonce: nonce
    });
  } catch (error) {
    res.render('error', { errorMessage: 'An error occurred while fetching smurf accounts.' });
  }
});

router.get('/filtered-accounts', filterLimiter, async (req, res) => {
  try {
    if (req.rateLimit.remaining < 0) {
      return res.status(429).send('Rate limit exceeded. Please wait and try again later.');
    }
    const sortBy = req.query.sort || 'asc';
    const filterRegion = req.query.region || '';
    const filterChampion = req.query.champion || 'All';
    const filterSkin = req.query.skin || 'All';
    const blueEssenceRange = req.query.blueEssenceRange || '0;110000';

    const accounts = await getAccounts(sortBy, filterRegion, filterChampion, filterSkin, blueEssenceRange);

    res.render('partials/smurfs', { accounts}, (err, html) => {
      if (err) {
        res.status(500).json({ error: 'An error occurred while rendering the accounts section.' });
      } else {
        res.status(200).send(html);
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while fetching smurf accounts.' });
  }
});

async function getAccounts(sortBy, filterRegion, filterChampions, filterSkins, blueEssenceRange) {
  try {
    const [accountsResponse] = await pool.execute('SELECT id, price, blueessence, region, level, skinids FROM smurfaccounts WHERE purchaseStatus = FALSE');
    const allAccounts = accountsResponse;
    const skinDataResponse = await axios.get('https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/skins.json');
    const skinData = skinDataResponse.data;

    if (!Array.isArray(filterSkins)) {
      filterSkins = [filterSkins];
    }
    if (!Array.isArray(filterChampions)) {
      filterChampions = [filterChampions];
    }
    for (const account of allAccounts) {
      const skinIds = account.skinids;
      let highestRarityValue = 0;
      let highestRarityTilePath = '';
      let highestRarityTilePath0 = '';
      let highestRarityName = [];
      const skinNames = [];
      const championNames = [];

      if (Array.isArray(skinIds)) {
        for (const skinId of skinIds) {
          const skinInfo = skinData[skinId];

          if (skinInfo) {
            const championID = skinId.replace(/\d{3}$/, '000');
            const championID0 = championID.replace(/000$/, '');
            const championName = skinData[championID];

            skinNames.push(skinInfo.name);
            championNames.push(championName.name);

            const rarityValue = getRarityValue(skinInfo.rarity);

            if (filterChampions.includes('All') && filterSkins.includes('All')){
              if (rarityValue > highestRarityValue) {
                highestRarityValue = rarityValue;
                highestRarityTilePath = extractChampionTilesPath(skinInfo.tilePath);
                highestRarityTilePath0 = "/champion-tiles/" + championID0 + "/" + skinId + ".jpg";
                highestRarityName = [skinInfo.name];
              }
            } else if ((!filterChampions.includes('All') || !filterSkins.includes('All')) && (filterChampions.includes(championName.name) || filterSkins.includes(skinInfo.name))){
              if (rarityValue > highestRarityValue) {
                highestRarityValue = rarityValue;
                highestRarityTilePath = extractChampionTilesPath(skinInfo.tilePath);
                highestRarityTilePath0 = "/champion-tiles/" + championID0 + "/" + skinId + ".jpg";
              }
              highestRarityName.push(skinInfo.name);
            }
          }
        }
      }
      account.highestRarityTilePath = highestRarityTilePath;
      account.highestRarityTilePath0 = highestRarityTilePath0;
      account.highestRarityName = highestRarityName;
      account.skinNames = skinNames;
      account.championNames = championNames;
    }

    const filteredAccounts = allAccounts.filter(account => {
      return filterRegion === '' || account.region === filterRegion;
    });
      

    const championFilter = (filterChampions.includes('All'))
      ? (account) => true
      : (account) => filterChampions.some(champion => account.championNames.includes(champion));

      const skinFilter = (filterSkins.includes('All'))
      ? (account) => true
      : (account) => filterSkins.some(skin => account.skinNames.includes(skin));

    const [minBlueEssence, maxBlueEssence] = blueEssenceRange.split(';').map(Number);

    const blueEssenceFilter = (minBlueEssence >= 0 && maxBlueEssence > 0)
      ? (account) => account.blueessence >= minBlueEssence && account.blueessence <= maxBlueEssence
      : (account) => true;

      const filteredAndSortedAccounts = filteredAccounts
      .filter(championFilter)
      .filter(skinFilter)
      .filter(blueEssenceFilter)
      .sort((a, b) => {
        const aChampionSkinCount = a.championNames.filter(champion => filterChampions.includes(champion)).length;
        const bChampionSkinCount = b.championNames.filter(champion => filterChampions.includes(champion)).length;
    
        if (bChampionSkinCount !== aChampionSkinCount) {
          return bChampionSkinCount - aChampionSkinCount;
        } else if (a.price === b.price) {
          return a.blueessence - b.blueessence;
        } else if (sortBy === 'asc') {
          return a.price - b.price;
        } else {
          return b.price - a.price;
        }
      });
    
    return filteredAndSortedAccounts;
    
  } catch (error) {
    throw error;
  }
}


function extractChampionTilesPath(tilePath) {
  const startIndex = tilePath.indexOf('champion-tiles');
  if (startIndex !== -1) {
    return tilePath.substring(startIndex);
  }
  return tilePath;
}

async function getChampionList() {
  try {
    const championDataResponse = await axios.get('https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json');
    let championData = championDataResponse.data;

    if (championData.length > 0) {
      championData.shift();
    }

    championData = championData.sort((a, b) => {
      return a.name.localeCompare(b.name);
    });

    return championData;
  } catch (error) {
    console.error('Error fetching champion data:', error);
    return [];
  }
}
async function getSkinsList() {
  try {
    const skinsDataResponse = await axios.get('https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/skins.json');
    let skinsData = skinsDataResponse.data;

    const nonBaseSkins = Object.values(skinsData).filter(skin => !skin.isBase);
    const nonBaseSkinNames = nonBaseSkins.map(skin => skin.name);

    return nonBaseSkinNames;
  } catch (error) {
    console.error('Error fetching skin data:', error);
    return [];
  }
}

function getRarityValue(rarityName) {
  switch (rarityName) {
    case 'kNoRarity':
      return 1;
    case 'kRare':
      return 2;
    case 'kEpic':
      return 3;
    case 'kLegendary':
      return 4;
    case 'kUltimate':
      return 5;
    case 'kMythic':
      return 6;
    default:
      return 0;
  }
}

module.exports = router;

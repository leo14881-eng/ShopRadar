'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { connectRedis, invalidateTrendingCache, closeRedis } = require('../redis-client');

connectRedis()
  .then(function () {
    return invalidateTrendingCache();
  })
  .then(function (cleared) {
    console.log('trending cache cleared:', cleared);
  })
  .finally(function () {
    return closeRedis();
  })
  .catch(function (err) {
    console.error(err);
    process.exit(1);
  });

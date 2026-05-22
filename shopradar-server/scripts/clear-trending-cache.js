'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const {
  connectRedis,
  invalidateTrendingCache,
  invalidateFamousStoresCache,
  closeRedis,
} = require('../redis-client');

connectRedis()
  .then(function () {
    return Promise.all([
      invalidateTrendingCache(),
      invalidateFamousStoresCache(),
    ]);
  })
  .then(function (results) {
    console.log('trending cache cleared:', results[0]);
    console.log('famous-stores cache cleared:', results[1]);
  })
  .finally(function () {
    return closeRedis();
  })
  .catch(function (err) {
    console.error(err);
    process.exit(1);
  });

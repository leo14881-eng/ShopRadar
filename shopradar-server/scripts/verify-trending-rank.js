'use strict';

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const trending = require('../trending');

const db = new sqlite3.Database(path.join(__dirname, '..', 'database.sqlite'));

trending
  .queryTrendingGolden(db, { limit: 10 })
  .then(function (result) {
    const summary = (result.items || []).map(function (item) {
      return {
        rank: item.rank,
        shop: item.shop_domain,
        title: String(item.title || '').slice(0, 40),
      };
    });
    console.log(JSON.stringify(summary, null, 2));
  })
  .finally(function () {
    db.close();
  })
  .catch(function (err) {
    console.error(err);
    process.exit(1);
  });

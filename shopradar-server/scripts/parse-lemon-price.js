#!/usr/bin/env node
'use strict';
const https = require('https');
const url =
  'https://shopradar.lemonsqueezy.com/checkout/buy/9a42e638-77ac-440c-ad73-82177b031a90';

https
  .get(url, { headers: { 'User-Agent': 'ShopRadar/1.0' } }, function (res) {
    let body = '';
    res.on('data', function (chunk) {
      body += chunk;
    });
    res.on('end', function () {
      const match = body.match(/data-page="([^"]+)"/);
      if (!match) {
        console.error('no data-page');
        process.exit(1);
      }
      const json = JSON.parse(
        match[1]
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&#039;/g, "'")
      );
      const props = json.props || {};
      const variant = props.variant || props.checkout?.variant || {};
      const product = props.product || {};
      console.log(
        JSON.stringify(
          {
            pageTitle: props.pageTitle,
            productName: product.name || variant.name,
            price: variant.price,
            priceFormatted: variant.price_formatted || variant.formatted_price,
            interval: variant.interval,
            intervalCount: variant.interval_count,
            isSubscription: variant.is_subscription,
          },
          null,
          2
        )
      );
    });
  })
  .on('error', function (err) {
    console.error(err.message);
    process.exit(1);
  });

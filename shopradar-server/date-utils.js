'use strict';

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = {
  getTodayDateString: getTodayDateString,
};

import { formatNone, formatShares, formatBestPrice } from 'utils/format-number';
import {
  INVALID_OUTCOME_ID,
  INVALID_BEST_BID_ALERT_VALUE,
} from 'modules/common/constants';
import { createBigNumber } from 'utils/create-big-number';
import memoize from 'memoizee';

export const selectMarketOutcomeBestBidAsk = memoize(
  (orderBook, tickSize = 0) => {
    const none = { price: formatNone(), shares: formatNone() };
    let topAsk = none;
    let topBid = none;

    const formatData = item => {
      return {
        price: formatBestPrice(item.price, tickSize),
        shares: formatShares(item.shares, { decimals: 2, decimalsRounded: 2 }),
      };
    };

    if (orderBook) {
      topAsk =
        orderBook.asks && orderBook.asks.length > 0
          ? orderBook.asks
              // Ascending order for asks
              .sort((a, b) => Number(a.price) - Number(b.price))
              .map(item => formatData(item))
              .shift()
          : topAsk;

      topBid =
        orderBook.bids && orderBook.bids.length > 0
          ? orderBook.bids
              // Decreasing order for bids
              .sort((a, b) => Number(b.price) - Number(a.price))
              .map(item => formatData(item))
              .shift()
          : topBid;
    }

    return {
      topAsk,
      topBid,
    };
  },
  { max: 1 }
);

export const selectBestBidAlert = (
  outcomeId: number,
  bestBidPrice: number,
  minPrice: string,
  maxPrice: string
) => {
  if (outcomeId !== INVALID_OUTCOME_ID) return false;
  const range = createBigNumber(maxPrice).minus(createBigNumber(minPrice));
  const percentage = createBigNumber(bestBidPrice)
    .minus(createBigNumber(minPrice))
    .dividedBy(range);
  return percentage.gte(INVALID_BEST_BID_ALERT_VALUE);
};

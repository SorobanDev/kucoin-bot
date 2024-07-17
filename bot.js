var ccxt = require("ccxt");
var axios = require("axios");
require("dotenv").config();
const exchanges = ccxt.exchanges;
const kucoin = new ccxt.kucoinfutures({
  apiKey: process.env.KUCOIN_API_KEY,
  secret: process.env.KUCOIN_API_SECRET,
  password: process.env.KUCOIN_API_PASSWORD,
});

let sum = 0;
let sumMax = 0;

class PricesArray {
  constructor(maxLength) {
    this.array = [];
    this.maxLength = maxLength;
  }

  addElement(newElement) {
    this.array.push(newElement);
    if (this.array.length > this.maxLength) {
      this.array.shift();
    }
  }

  getArray() {
    return this.array;
  }

  calculateRegressionSlope() {
    const n = this.array.length;
    if (n < 2) {
      throw new Error(
        "Insufficient data points to calculate regression slope."
      );
    }

    // Calculate sum of x and y values
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < n; i++) {
      sumX += i + 1; // x values are 1, 2, 3, ..., n
      sumY += this.array[i];
    }

    // Calculate sum of xy and x^2
    let sumXY = 0;
    let sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumXY += (i + 1) * this.array[i];
      sumXX += (i + 1) ** 2;
    }

    // Calculate slope (m) of the regression line (y = mx + c)
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX ** 2);

    const factorSlope = slope * 10000000;

    sum += factorSlope;
    if (sum > sumMax) {
      sumMax = sum;
    }

    return [sum, sumMax];
    // return factorSlope, sum;
  }
}

const prices = new PricesArray(3);

const symbol = "NOTUSDTM";
const btcSymbol = "BTC/USDT";

const BASE_URL = "https://api-futures.kucoin.com";

const fundingUrl = `/api/v1/funding-rate/${symbol}/current`;

async function fetchOrder() {
  const res = await axios.get(
    `${BASE_URL}/api/v1/level2/snapshot?symbol=${symbol}`
  );

  const orders = res.data;
  const top20Bids = orders.data.bids.slice(0, 20);
  const top20Asks = orders.data.asks.slice(0, 20);
  const demand = top20Bids.reduce((sum, arr) => sum + arr[1] * arr[0], 0);
  const suply = top20Asks.reduce((sum, arr) => sum + arr[1] * arr[0], 0);
  const top2Bids = orders.data.bids.slice(0, 2);
  const top2Asks = orders.data.asks.slice(0, 2);
  const demand2 = top2Bids.reduce((sum, arr) => sum + arr[1] * arr[0], 0);
  const suply2 = top2Asks.reduce((sum, arr) => sum + arr[1] * arr[0], 0);
  const minSuplyPrice = top20Asks[0][0];
  const bestDemandPrice = top20Bids[0][0];
  const maxBidDemand = top20Bids.reduce(
    (max, current) => (current[1] > max[1] ? current : max),
    top20Bids[0]
  );

  prices.addElement(top20Bids[0][0]);

  const maxSuply = top20Asks.reduce(
    (max, current) => (current[1] > max[1] ? current : max),
    top20Asks[0]
  );

  // Filter the arrays based on the price condition (price < maxPrice)

  const sellPrice = top20Bids[0][0];
  const maxPriceSupply = top20Asks[0][0] + 0.00002;
  console.log("the prices array", prices.getArray());

  if (prices.getArray().length > 1) {
    if (prices.calculateRegressionSlope()[0] < -1000) {
      sum = 0;
      sumMax = 0;
    }
  }

  const balance = (await kucoin.fetchBalance())?.info?.data?.positionMargin;

  if (prices.getArray().length > 1) {
    if (prices.calculateRegressionSlope()[1] > 3500 && balance === 0) {
      await kucoin.createOrder(symbol, "market", "buy", 750, "", {
        leverage: 30,
      });
    }

    if (
      prices.calculateRegressionSlope()[0] <
        prices.calculateRegressionSlope()[1] / 1.6 &&
      balance > 0
    ) {
      await kucoin.createOrder(symbol, "market", "sell", 750, "", {
        leverage: 30,
      });
      sum = 0;
      sumMax = 0;
    }
  }

  console.log(balance);
}

async function getSymbols() {
  const res = await axios.get(`${BASE_URL}/api/v1/contracts/active`);
  console.log(res.data);
}

// async function fetchOrdersSequentially() {
//   for (let i = 0; i < 15; i++) {
//     await fetchOrder();
//     // console.log(`Fetch order ${i + 1} completed.`);
//     await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay between each fetchOrder call
//   }
// }

async function fetchOrdersSequentially() {
  while (true) {
    try {
      await fetchOrder();
      if (prices.getArray().length > 1) {
        console.log("slope is", prices.calculateRegressionSlope());
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (e) {
      console.log(e);
    }
  }
}

fetchOrdersSequentially();

var ccxt = require("ccxt");
var axios = require("axios");
const http = require("http");
require("dotenv").config();

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
  }
}

const prices = new PricesArray(5);

const symbol = "NOTUSDTM";

const BASE_URL = "https://api-futures.kucoin.com";

async function fetchOrder() {
  const res = await axios.get(
    `${BASE_URL}/api/v1/level2/snapshot?symbol=${symbol}`
  );

  const orders = res.data;
  const top20Bids = orders.data.bids.slice(0, 5);

  prices.addElement(top20Bids[0][0]);

  if (prices.getArray().length > 1) {
    if (prices.calculateRegressionSlope()[0] < -1000) {
      sum = 0;
      sumMax = 0;
    }
  }

  const balance = (await kucoin.fetchBalance())?.info?.data?.positionMargin;
  const profit = (await kucoin.fetchBalance())?.info?.data?.unrealisedPNL;

  if (prices.getArray().length > 1) {
    if (prices.calculateRegressionSlope()[1] > 3500 && balance === 0) {
      await kucoin.createOrder(symbol, "market", "buy", 750, "", {
        leverage: 30,
      });
    }

    if (
      prices.calculateRegressionSlope()[0] <
        prices.calculateRegressionSlope()[1] * 0.9 &&
      balance > 0
    ) {
      await kucoin.createOrder(symbol, "market", "sell", 750, "", {
        leverage: 30,
      });
      sum = 0;
      sumMax = 0;
    }
  }
}

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

const PORT = process.env.PORT || 3000;

fetchOrdersSequentially();

http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Hello World!");
  })
  .listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";
import axios from "axios";

const API_KEY = process.env.API_KEY;
const VALID_KEYS = process.env.VALID_KEYS?.split(",");

// Define the base URL and default headers
const API_BASE_URL = "https://api.financialdatasets.ai";
const getHeaders = () => ({
    "X-API-KEY": API_KEY,
});

const handler = createMcpHandler((server) => { 
  // Tool: Get company facts by ticker
  server.tool(
    "getCompanyFacts",
    "Get company facts for a given ticker",
    { ticker: z.string().describe("The ticker symbol of the company") },
    async ({ ticker }) => {
      try {
        const url = new URL(`${API_BASE_URL}/company/facts`);
        const response = await axios.get(url.toString(), {
          headers: getHeaders(),
          params: { ticker }
        });

        return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Error fetching company facts: ${errorMessage}` }] };
      }
    }
  );

  // Tool: Get historical stock prices
  server.tool(
    "getStockPrices",
    "Get historical stock prices for a given ticker",
    {
      ticker: z.string().describe("The ticker symbol of the company"),
      interval: z.enum(["second", "minute", "day", "week", "month", "year"]).describe("The time interval for price data"),
      intervalMultiplier: z.number().int().min(1).describe("The multiplier for the interval"),
      startDate: z.string().describe("The start date in YYYY-MM-DD format"),
      endDate: z.string().describe("The end date in YYYY-MM-DD format"),
      limit: z.number().int().min(1).max(5000).optional().describe("Maximum number of records to return (max: 5000)"),
    },
    async ({ ticker, interval, intervalMultiplier, startDate, endDate, limit }) => {
      try {
        const response = await axios.get(`${API_BASE_URL}/prices`, {
          headers: getHeaders(),
          params: {
            ticker,
            interval,
            interval_multiplier: intervalMultiplier,
            start_date: startDate,
            end_date: endDate,
            limit,
          }
        });

        return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Error fetching stock prices: ${errorMessage}` }] };
      }
    }
  );

  // Tool: Get real-time stock price snapshot
  server.tool(
    "getStockSnapshot",
    "Get real-time stock price snapshot for a given ticker",
    { ticker: z.string().describe("The ticker symbol of the company") },
    async ({ ticker }, { authInfo }) => {
      console.log(authInfo);
      try {
        const response = await axios.get(`${API_BASE_URL}/prices/snapshot`, {
          headers: getHeaders(),
          params: { ticker }
        });

        return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Error fetching stock snapshot: ${errorMessage}` }] };
      }
    }
  );

  // Tool: Get financial statements
  server.tool(
    "getFinancialStatements",
    "Get financial statements for a given ticker",
    {
      ticker: z.string().describe("The ticker symbol of the company"),
      period: z.enum(["annual", "quarterly", "ttm"]).describe("The time period for the financial data"),
      limit: z.number().int().min(1).optional().describe("Maximum number of statements to return"),
    },
    async ({ ticker, period, limit }) => {
      try {
        const response = await axios.get(`${API_BASE_URL}/financials`, {
          headers: getHeaders(),
          params: { ticker, period, limit }
        });

        return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Error fetching financial statements: ${errorMessage}` }] };
      }
    }
  );

  // Tool: Get insider trades
  server.tool(
    "getInsiderTrades",
    "Get insider trades for a given ticker",
    {
      ticker: z.string().describe("The ticker symbol of the company"),
      limit: z.number().int().min(1).optional().describe("Maximum number of trades to return"),
    },
    async ({ ticker, limit }) => {
      try {
        const response = await axios.get(`${API_BASE_URL}/insider-trades`, {
          headers: getHeaders(),
          params: { ticker, limit }
        });

        return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Error fetching insider trades: ${errorMessage}` }] };
      }
    }
  );

  // Tool: Get company news
  server.tool(
    "getCompanyNews",
    "Get company news for a given ticker",
    {
      ticker: z.string().describe("The ticker symbol of the company"),
      startDate: z.string().optional().describe("The start date in YYYY-MM-DD format"),
      endDate: z.string().optional().describe("The end date in YYYY-MM-DD format"),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of news articles to return (max: 100)"),
    },
    async ({ ticker, startDate, endDate, limit }) => {
      try {
        const params: Record<string, any> = { ticker };
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;
        if (limit) params.limit = limit;

        const response = await axios.get(`${API_BASE_URL}/news`, {
          headers: getHeaders(),
          params
        });

        return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Error fetching company news: ${errorMessage}` }] };
      }
    }
  );

  // Tool: Search financial data by filters
  server.tool(
    "searchFinancialData",
    "Search financial data by filters",
    {
      period: z.enum(["annual", "quarterly", "ttm"]).optional().describe("The time period for the financial data"),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of results to return (max: 100)"),
      filters: z.array(z.object({
        field: z.string().describe("The financial metric to filter on (e.g., revenue, net_income, total_debt)"),
        operator: z.enum(["gt", "lt", "gte", "lte", "eq"]).describe("The comparison operator"),
        value: z.number().describe("The value to compare against"),
      })).min(1).describe("Array of filter objects"),
    },
    async ({ period, limit, filters }) => {
      try {
        const response = await axios.post(`${API_BASE_URL}/financials/search`, {
          period: period || "ttm",
          limit: limit || 100,
          filters,
        }, {
          headers: {
            ...getHeaders(),
            'Content-Type': 'application/json'
          },
        });

        return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Error searching financial data: ${errorMessage}` }] };
      }
    }
  );

  // Tool: Get crypto prices
  server.tool(
    "getCryptoPrices",
    "Get crypto prices for a given ticker",
    {
      ticker: z.string().describe("The cryptocurrency ticker (e.g., BTC-USD)"),
      interval: z.enum(["minute", "day", "week", "month", "year"]).describe("The time interval for price data"),
      intervalMultiplier: z.number().int().min(1).describe("The multiplier for the interval"),
      startDate: z.string().describe("The start date in YYYY-MM-DD format"),
      endDate: z.string().describe("The end date in YYYY-MM-DD format"),
      limit: z.number().int().min(1).max(5000).optional().describe("Maximum number of records to return (max: 5000)"),
    },
    async ({ ticker, interval, intervalMultiplier, startDate, endDate, limit }, {authInfo}) => {
      console.log(authInfo);
      try {
        const response = await axios.get(`${API_BASE_URL}/crypto/prices`, {
          headers: getHeaders(),
          params: {
            ticker,
            interval,
            interval_multiplier: intervalMultiplier,
            start_date: startDate,
            end_date: endDate,
            limit,
          }
        });

        return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Error fetching crypto prices: ${errorMessage}` }] };
      }
    }
  );

  // Tool: Get crypto price snapshot
  server.tool(
    "getCryptoSnapshot",
    "Get crypto price snapshot for a given ticker",
    { ticker: z.string().describe("The cryptocurrency ticker (e.g., BTC-USD)") },
    async ({ ticker }) => {
      try {
        const response = await axios.get(`${API_BASE_URL}/crypto/prices/snapshot`, {
          headers: getHeaders(),
          params: { ticker }
        });

        return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Error fetching crypto snapshot: ${errorMessage}` }] };
      }
    }
  );

  // Tool: Get institutional ownership by ticker
  server.tool(
    "getInstitutionalOwnership",
    "Get institutional ownership for a given ticker",
    {
      ticker: z.string().describe("The ticker symbol of the company"),
      limit: z.number().int().min(1).optional().describe("Maximum number of institutions to return"),
      reportPeriod: z.string().optional().describe("Filter by report period date in YYYY-MM-DD format"),
    },
    async ({ ticker, limit, reportPeriod }) => {
      try {
        const params: Record<string, any> = { ticker };
        if (limit) params.limit = limit;
        if (reportPeriod) params.report_period = reportPeriod;

        const response = await axios.get(`${API_BASE_URL}/institutional-ownership`, {
          headers: getHeaders(),
          params
        });

        return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Error fetching institutional ownership: ${errorMessage}` }] };
      }
    }
  );

  // Tool: Get institutional ownership by investor
  server.tool(
    "getInvestorHoldings",
    "Get investor holdings for a given investor",
    {
      investor: z.string().describe("The name of the investment manager/institution"),
      limit: z.number().int().min(1).optional().describe("Maximum number of holdings to return"),
      reportPeriod: z.string().optional().describe("Filter by report period date in YYYY-MM-DD format"),
    },
    async ({ investor, limit, reportPeriod }) => {
      try {
        const params: Record<string, any> = { investor };
        if (limit) params.limit = limit;
        if (reportPeriod) params.report_period = reportPeriod;

        const response = await axios.get(`${API_BASE_URL}/institutional-ownership`, {
          headers: getHeaders(),
          params
        });

        return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Error fetching investor holdings: ${errorMessage}` }] };
      }
    }
  );

  // Tool: Get SEC filings
  server.tool(
    "getSecFilings",
    "Get SEC filings for a given ticker",
    {
      ticker: z.string().describe("The ticker symbol of the company"),
      filingType: z.enum(["10-K", "10-Q", "8-K", "4", "144"]).optional().describe("The type of filing to filter by"),
    },
    async ({ ticker, filingType }) => {
      try {
        const params: Record<string, any> = { ticker };
        if (filingType) params.filing_type = filingType;

        const response = await axios.get(`${API_BASE_URL}/filings`, {
          headers: getHeaders(),
          params
        });

        return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Error fetching SEC filings: ${errorMessage}` }] };
      }
    }
  );

  // Tool: Get specific items from SEC filings
  server.tool(
    "getSecFilingItems",
    "Get specific items from SEC filings for a given ticker",
    {
      ticker: z.string().describe("The ticker symbol of the company"),
      filingType: z.enum(["10-K", "10-Q"]).describe("The type of filing"),
      year: z.number().int().describe("The year of the filing"),
      quarter: z.number().int().min(1).max(4).optional().describe("The quarter of the filing (required for 10-Q)"),
      items: z.array(z.string()).optional().describe("Array of specific items to extract (e.g., 'Item-1', 'Item-7A')"),
    },
    async ({ ticker, filingType, year, quarter, items }, { authInfo }) => {

      console.log(authInfo);
      try {
        const params: Record<string, any> = {
          ticker,
          filing_type: filingType,
          year
        };

        if (quarter) params.quarter = quarter;
        if (items && items.length > 0) {
          params.item = items;
        }

        const response = await axios.get(`${API_BASE_URL}/filings/items`, {
          headers: getHeaders(),
          params
        });

        return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Error fetching SEC filing items: ${errorMessage}` }] };
      }
    }
  );
});

const wrappedHandler = async (req: Request) => {
  const apiKey = req.headers.get('x-api-key');
  const isAuthenticated = apiKey && VALID_KEYS?.includes(apiKey);

  // Add auth info to request headers
  const modifiedReq = new Request(req.url, {
    method: req.method,
    headers: {
      ...Object.fromEntries(req.headers),
      'x-auth-status': isAuthenticated ? 'authenticated' : 'unauthenticated'
    },
    body: req.body,
    // @ts-ignore -- 'duplex' required by Node.js 18+ but not in TypeScript types yet
    duplex: 'half'
  });

  return handler(modifiedReq);
};

export { wrappedHandler as GET, wrappedHandler as POST, wrappedHandler as DELETE };

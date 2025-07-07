import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";

const VALID_KEYS = process.env.VALID_KEYS?.split(",");
const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID;
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET;
const REDDIT_USER_AGENT = process.env.REDDIT_USER_AGENT || "MCPRedditBot/1.0";

let accessToken: string | null = null;
let tokenExpiry: number = 0;

// Helper function to get OAuth token for Reddit API
async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken;
  }

  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) {
    throw new Error("Reddit API credentials not configured. Please set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET environment variables.");
  }

  const auth = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString('base64');
  
  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'User-Agent': REDDIT_USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error(`Failed to get Reddit access token: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // Refresh 1 minute early
  
  return accessToken!;
}

// Helper function to make Reddit API requests
async function makeRedditRequest(endpoint: string, params: Record<string, any> = {}) {
  const token = await getAccessToken();
  
  const url = new URL(`https://oauth.reddit.com${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.append(key, String(value));
    }
  });

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': REDDIT_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Reddit API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

const handler = createMcpHandler((server) => {
  // Get Subreddit Information
  server.tool(
    "getSubredditInfo",
    "Get information about a specific subreddit",
    {
      subreddit: z.string().describe("The name of the subreddit (without r/ prefix)")
    },
    async ({ subreddit }) => {
      const data = await makeRedditRequest(`/r/${subreddit}/about`);
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2) 
        }] 
      };
    }
  );

  // Get Subreddit Posts
  server.tool(
    "getSubredditPosts",
    "Get posts from a subreddit with various sorting options",
    {
      subreddit: z.string().describe("The name of the subreddit (without r/ prefix)"),
      sort: z.enum(["hot", "new", "rising", "top"]).default("hot").describe("How to sort the posts"),
      time: z.enum(["hour", "day", "week", "month", "year", "all"]).optional().describe("Time period for 'top' sort"),
      limit: z.number().min(1).max(100).default(25).describe("Number of posts to retrieve (1-100)"),
      after: z.string().optional().describe("Pagination token for getting next page of results")
    },
    async ({ subreddit, sort, time, limit, after }) => {
      const params: Record<string, any> = { limit, after };
      if (sort === "top" && time) {
        params.t = time;
      }
      
      const data = await makeRedditRequest(`/r/${subreddit}/${sort}`, params);
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2) 
        }] 
      };
    }
  );

  // Get Post Details
  server.tool(
    "getPostDetails",
    "Get detailed information about a specific post",
    {
      subreddit: z.string().describe("The name of the subreddit (without r/ prefix)"),
      postId: z.string().describe("The ID of the post (without t3_ prefix)")
    },
    async ({ subreddit, postId }) => {
      const data = await makeRedditRequest(`/r/${subreddit}/comments/${postId}`);
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2) 
        }] 
      };
    }
  );

  // Get Post Comments
  server.tool(
    "getPostComments",
    "Get comments for a specific post with sorting and depth options",
    {
      subreddit: z.string().describe("The name of the subreddit (without r/ prefix)"),
      postId: z.string().describe("The ID of the post (without t3_ prefix)"),
      sort: z.enum(["confidence", "top", "new", "controversial", "old", "random", "qa", "live"]).default("confidence").describe("How to sort comments"),
      limit: z.number().min(1).max(500).default(100).describe("Maximum number of comments to retrieve"),
      depth: z.number().min(1).max(10).optional().describe("Maximum depth of comment tree to retrieve")
    },
    async ({ subreddit, postId, sort, limit, depth }) => {
      const params: Record<string, any> = { sort, limit };
      if (depth) params.depth = depth;
      
      const data = await makeRedditRequest(`/r/${subreddit}/comments/${postId}`, params);
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2) 
        }] 
      };
    }
  );

  // Get User Profile
  server.tool(
    "getUserProfile",
    "Get public profile information for a Reddit user",
    {
      username: z.string().describe("The username (without u/ prefix)")
    },
    async ({ username }) => {
      const data = await makeRedditRequest(`/user/${username}/about`);
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2) 
        }] 
      };
    }
  );

  // Get User Posts
  server.tool(
    "getUserPosts",
    "Get posts submitted by a specific user",
    {
      username: z.string().describe("The username (without u/ prefix)"),
      sort: z.enum(["hot", "new", "top"]).default("new").describe("How to sort the posts"),
      time: z.enum(["hour", "day", "week", "month", "year", "all"]).optional().describe("Time period for 'top' sort"),
      limit: z.number().min(1).max(100).default(25).describe("Number of posts to retrieve (1-100)"),
      after: z.string().optional().describe("Pagination token for getting next page of results")
    },
    async ({ username, sort, time, limit, after }) => {
      const params: Record<string, any> = { limit, after };
      if (sort === "top" && time) {
        params.t = time;
      }
      
      const data = await makeRedditRequest(`/user/${username}/submitted`, { ...params, sort });
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2) 
        }] 
      };
    }
  );

  // Get User Comments
  server.tool(
    "getUserComments",
    "Get comments posted by a specific user",
    {
      username: z.string().describe("The username (without u/ prefix)"),
      sort: z.enum(["hot", "new", "top"]).default("new").describe("How to sort the comments"),
      time: z.enum(["hour", "day", "week", "month", "year", "all"]).optional().describe("Time period for 'top' sort"),
      limit: z.number().min(1).max(100).default(25).describe("Number of comments to retrieve (1-100)"),
      after: z.string().optional().describe("Pagination token for getting next page of results")
    },
    async ({ username, sort, time, limit, after }) => {
      const params: Record<string, any> = { limit, after };
      if (sort === "top" && time) {
        params.t = time;
      }
      
      const data = await makeRedditRequest(`/user/${username}/comments`, { ...params, sort });
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2) 
        }] 
      };
    }
  );

  // Search Reddit
  server.tool(
    "searchReddit",
    "Search Reddit posts and comments across all subreddits or within a specific subreddit",
    {
      query: z.string().describe("The search query"),
      subreddit: z.string().optional().describe("Limit search to specific subreddit (without r/ prefix)"),
      sort: z.enum(["relevance", "hot", "top", "new", "comments"]).default("relevance").describe("How to sort search results"),
      time: z.enum(["hour", "day", "week", "month", "year", "all"]).default("all").describe("Time period to search within"),
      type: z.enum(["link", "sr", "user"]).optional().describe("Type of results: link (posts), sr (subreddits), user (users)"),
      limit: z.number().min(1).max(100).default(25).describe("Number of results to retrieve (1-100)"),
      after: z.string().optional().describe("Pagination token for getting next page of results")
    },
    async ({ query, subreddit, sort, time, type, limit, after }) => {
      const params: Record<string, any> = { 
        q: query, 
        sort, 
        t: time, 
        limit, 
        after 
      };
      if (type) params.type = type;
      if (subreddit) params.restrict_sr = "true";
      
      const endpoint = subreddit ? `/r/${subreddit}/search` : "/search";
      const data = await makeRedditRequest(endpoint, params);
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2) 
        }] 
      };
    }
  );

  // Get Popular Subreddits
  server.tool(
    "getPopularSubreddits",
    "Get a list of popular/trending subreddits",
    {
      limit: z.number().min(1).max(100).default(25).describe("Number of subreddits to retrieve (1-100)"),
      after: z.string().optional().describe("Pagination token for getting next page of results")
    },
    async ({ limit, after }) => {
      const params = { limit, after };
      const data = await makeRedditRequest("/subreddits/popular", params);
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2) 
        }] 
      };
    }
  );

  // Get New Subreddits
  server.tool(
    "getNewSubreddits",
    "Get a list of newly created subreddits",
    {
      limit: z.number().min(1).max(100).default(25).describe("Number of subreddits to retrieve (1-100)"),
      after: z.string().optional().describe("Pagination token for getting next page of results")
    },
    async ({ limit, after }) => {
      const params = { limit, after };
      const data = await makeRedditRequest("/subreddits/new", params);
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2) 
        }] 
      };
    }
  );

  // Get r/all Posts
  server.tool(
    "getAllPosts",
    "Get posts from r/all (front page of Reddit)",
    {
      sort: z.enum(["hot", "new", "rising", "top"]).default("hot").describe("How to sort the posts"),
      time: z.enum(["hour", "day", "week", "month", "year", "all"]).optional().describe("Time period for 'top' sort"),
      limit: z.number().min(1).max(100).default(25).describe("Number of posts to retrieve (1-100)"),
      after: z.string().optional().describe("Pagination token for getting next page of results")
    },
    async ({ sort, time, limit, after }) => {
      const params: Record<string, any> = { limit, after };
      if (sort === "top" && time) {
        params.t = time;
      }
      
      const data = await makeRedditRequest(`/${sort}`, params);
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2) 
        }] 
      };
    }
  );

  // Get Subreddit Rules
  server.tool(
    "getSubredditRules",
    "Get the rules for a specific subreddit",
    {
      subreddit: z.string().describe("The name of the subreddit (without r/ prefix)")
    },
    async ({ subreddit }) => {
      const data = await makeRedditRequest(`/r/${subreddit}/about/rules`);
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2) 
        }] 
      };
    }
  );

  // Get Random Post
  server.tool(
    "getRandomPost",
    "Get a random post from Reddit or from a specific subreddit",
    {
      subreddit: z.string().optional().describe("The name of the subreddit (without r/ prefix). If not provided, gets random from all of Reddit")
    },
    async ({ subreddit }) => {
      const endpoint = subreddit ? `/r/${subreddit}/random` : "/random";
      const data = await makeRedditRequest(endpoint);
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2) 
        }] 
      };
    }
  );

  // Get Multiple Posts by IDs
  server.tool(
    "getPostsByIds",
    "Get multiple posts by their full names (IDs)",
    {
      postIds: z.string().describe("Comma-separated list of post fullnames (e.g., 't3_abc123,t3_def456')")
    },
    async ({ postIds }) => {
      const data = await makeRedditRequest("/api/info", { id: postIds });
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2) 
        }] 
      };
    }
  );

  // Get Subreddit Moderators
  server.tool(
    "getSubredditModerators",
    "Get the list of moderators for a specific subreddit",
    {
      subreddit: z.string().describe("The name of the subreddit (without r/ prefix)")
    },
    async ({ subreddit }) => {
      const data = await makeRedditRequest(`/r/${subreddit}/about/moderators`);
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2) 
        }] 
      };
    }
  );

  // Get User Trophies
  server.tool(
    "getUserTrophies",
    "Get trophies/achievements for a specific user",
    {
      username: z.string().describe("The username (without u/ prefix)")
    },
    async ({ username }) => {
      const data = await makeRedditRequest(`/user/${username}/trophies`);
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2) 
        }] 
      };
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
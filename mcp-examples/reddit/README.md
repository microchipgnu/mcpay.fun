# Reddit MCP Server

A Model Context Protocol (MCP) server that provides comprehensive access to Reddit's API for reading posts, comments, subreddits, and user data.

## Features

This MCP server provides 16 powerful tools for accessing Reddit data:

### Subreddit Tools
- **getSubredditInfo** - Get detailed information about a specific subreddit
- **getSubredditPosts** - Get posts from a subreddit with various sorting options
- **getSubredditRules** - Get the rules for a specific subreddit
- **getSubredditModerators** - Get the list of moderators for a subreddit
- **getPopularSubreddits** - Get a list of popular/trending subreddits
- **getNewSubreddits** - Get a list of newly created subreddits

### Post & Comment Tools
- **getPostDetails** - Get detailed information about a specific post
- **getPostComments** - Get comments for a specific post with sorting and depth options
- **getPostsByIds** - Get multiple posts by their full names (IDs)
- **getAllPosts** - Get posts from r/all (front page of Reddit)
- **getRandomPost** - Get a random post from Reddit or from a specific subreddit

### User Tools
- **getUserProfile** - Get public profile information for a Reddit user
- **getUserPosts** - Get posts submitted by a specific user
- **getUserComments** - Get comments posted by a specific user
- **getUserTrophies** - Get trophies/achievements for a specific user

### Search Tools
- **searchReddit** - Search Reddit posts and comments across all subreddits or within a specific subreddit

## Setup

### 1. Get Reddit API Credentials
1. Visit [Reddit App Preferences](https://www.reddit.com/prefs/apps)
2. Click "Create App" or "Create Another App"
3. Choose "script" as the app type
4. Fill in the required fields:
   - **Name**: Your app name
   - **Description**: Brief description of your app
   - **About URL**: Can be left blank
   - **Redirect URI**: Use `http://localhost:8080` (required but not used)
5. Note your **Client ID** (under the app name) and **Client Secret**

### 2. Environment Configuration
Set up your environment variables:
```bash
# Required: Your Reddit API credentials
REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_client_secret

# Optional: Custom User-Agent for API requests
REDDIT_USER_AGENT=MCPRedditBot/1.0

# Optional: For MCP server authentication
VALID_KEYS=your_mcp_server_api_key_1,your_mcp_server_api_key_2
```

### 3. Deploy to Vercel
```bash
# Navigate to the project directory
cd mcp-examples/reddit

# Set environment variables in Vercel
vercel env add REDDIT_CLIENT_ID
vercel env add REDDIT_CLIENT_SECRET

# Deploy to Vercel
vercel deploy
```

## Usage

All tools are automatically configured with your API credentials from the environment variables. Here are some examples:

### Get Subreddit Information
```json
{
  "tool": "getSubredditInfo",
  "parameters": {
    "subreddit": "MachineLearning"
  }
}
```

### Get Hot Posts from a Subreddit
```json
{
  "tool": "getSubredditPosts",
  "parameters": {
    "subreddit": "programming",
    "sort": "hot",
    "limit": 10
  }
}
```

### Search Reddit
```json
{
  "tool": "searchReddit",
  "parameters": {
    "query": "artificial intelligence",
    "sort": "top",
    "time": "week",
    "limit": 20
  }
}
```

### Get User Profile and Posts
```json
{
  "tool": "getUserProfile",
  "parameters": {
    "username": "spez"
  }
}
```

```json
{
  "tool": "getUserPosts",
  "parameters": {
    "username": "spez",
    "sort": "top",
    "time": "year",
    "limit": 5
  }
}
```

### Get Post Details with Comments
```json
{
  "tool": "getPostDetails",
  "parameters": {
    "subreddit": "AskReddit",
    "postId": "abc123"
  }
}
```

### Get Comments with Specific Sorting
```json
{
  "tool": "getPostComments",
  "parameters": {
    "subreddit": "science",
    "postId": "def456",
    "sort": "top",
    "limit": 50,
    "depth": 3
  }
}
```

### Search Within a Specific Subreddit
```json
{
  "tool": "searchReddit",
  "parameters": {
    "query": "machine learning",
    "subreddit": "programming",
    "sort": "relevance",
    "time": "month"
  }
}
```

### Get Popular Subreddits
```json
{
  "tool": "getPopularSubreddits",
  "parameters": {
    "limit": 50
  }
}
```

### Get Random Post
```json
{
  "tool": "getRandomPost",
  "parameters": {
    "subreddit": "todayilearned"
  }
}
```

## Pagination

Many endpoints support pagination using Reddit's `after` parameter:

1. **First request**: Omit the `after` parameter
2. **Subsequent requests**: Use the `after` value from the previous response
3. **Continue**: Until no more `after` value is returned

Example pagination workflow:
```json
// First request
{
  "tool": "getSubredditPosts",
  "parameters": {
    "subreddit": "technology",
    "limit": 25
  }
}

// Subsequent request using 'after' from previous response
{
  "tool": "getSubredditPosts",
  "parameters": {
    "subreddit": "technology",
    "limit": 25,
    "after": "t3_1a2b3c4d"
  }
}
```

## Sorting Options

### Posts
- **hot** - Currently popular posts (default)
- **new** - Newest posts first
- **rising** - Posts gaining popularity quickly
- **top** - Highest scored posts (requires time parameter)

### Comments
- **confidence** - Reddit's default algorithm (recommended)
- **top** - Highest scored comments
- **new** - Newest comments first
- **controversial** - Most controversial comments
- **old** - Oldest comments first
- **random** - Random order
- **qa** - Q&A style sorting
- **live** - Live thread sorting

### Time Periods (for 'top' sort)
- **hour** - Past hour
- **day** - Past 24 hours
- **week** - Past week
- **month** - Past month
- **year** - Past year
- **all** - All time

## Rate Limits & Best Practices

Reddit's API has the following rate limits:
- **60 requests per minute** for OAuth applications
- **600 requests per 10 minutes** for OAuth applications

**Best Practices:**
1. Use appropriate `limit` parameters to avoid unnecessary requests
2. Implement pagination properly using `after` tokens
3. Cache responses when appropriate to reduce API calls
4. Use specific subreddit searches when possible instead of site-wide searches
5. Respect Reddit's API terms of service

## Error Handling

The server provides detailed error messages for common issues:
- Missing or invalid API credentials (`Reddit API credentials not configured`)
- Invalid subreddit or user names
- Rate limit exceeded
- Network connectivity issues
- OAuth token refresh failures

All responses include detailed JSON data or error messages to help with debugging.

## Popular Use Cases

1. **Content Research** - Analyze trending topics and discussions across subreddits
2. **Community Analysis** - Study subreddit activity, rules, and moderation
3. **User Behavior Analysis** - Research user posting patterns and engagement
4. **Market Research** - Monitor discussions about products, brands, or industries
5. **Academic Research** - Study social media patterns and community dynamics
6. **Content Discovery** - Find relevant posts and discussions for specific topics
7. **Competitor Analysis** - Monitor mentions and discussions about competitors
8. **Trend Analysis** - Track emerging topics and viral content

## API Coverage

This MCP server covers the most commonly used Reddit API endpoints:
- **Listings** - Posts, comments, subreddits, users
- **Things** - Individual posts, comments, user profiles
- **Search** - Site-wide and subreddit-specific search
- **Subreddit Data** - Information, rules, moderators
- **User Data** - Profiles, posts, comments, trophies

## Security

- API credentials are stored as environment variables (more secure)
- All requests use HTTPS and OAuth 2.0
- No user data is cached or stored by the MCP server
- Environment variables are not exposed in tool responses
- Follows Reddit's API terms of service and rate limits

## Support

- Reddit API Documentation: [reddit.com/dev/api](https://www.reddit.com/dev/api)
- Reddit OAuth Guide: [github.com/reddit-archive/reddit/wiki/OAuth2](https://github.com/reddit-archive/reddit/wiki/OAuth2)
- MCP Protocol: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- Issues: Create an issue in this repository

## Limitations

- **Read-only access**: This server only provides read access to Reddit data
- **Public data only**: Can only access publicly available posts and comments
- **No user authentication**: Uses app-only OAuth (no user-specific actions)
- **Rate limited**: Subject to Reddit's API rate limits
- **No real-time**: Does not provide real-time updates or streaming data
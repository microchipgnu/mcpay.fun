# Reddit MCP Server - Usage Examples

This document provides comprehensive examples of how to use all the tools available in the Reddit MCP server.

## Subreddit Tools

### getSubredditInfo
Get detailed information about a specific subreddit including subscriber count, description, rules summary, and more.

```json
{
  "tool": "getSubredditInfo",
  "parameters": {
    "subreddit": "MachineLearning"
  }
}
```

### getSubredditPosts
Get posts from a subreddit with various sorting and filtering options.

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

Get top posts from the past week:
```json
{
  "tool": "getSubredditPosts",
  "parameters": {
    "subreddit": "technology",
    "sort": "top",
    "time": "week",
    "limit": 20
  }
}
```

### getSubredditRules
Get the rules for a specific subreddit to understand posting guidelines.

```json
{
  "tool": "getSubredditRules",
  "parameters": {
    "subreddit": "AskReddit"
  }
}
```

### getSubredditModerators
Get the list of moderators for a subreddit.

```json
{
  "tool": "getSubredditModerators",
  "parameters": {
    "subreddit": "science"
  }
}
```

### getPopularSubreddits
Discover popular and trending subreddits.

```json
{
  "tool": "getPopularSubreddits",
  "parameters": {
    "limit": 50
  }
}
```

### getNewSubreddits
Find newly created subreddits.

```json
{
  "tool": "getNewSubreddits",
  "parameters": {
    "limit": 25
  }
}
```

## Post & Comment Tools

### getPostDetails
Get comprehensive information about a specific post including content, metadata, and basic comment structure.

```json
{
  "tool": "getPostDetails",
  "parameters": {
    "subreddit": "AskReddit",
    "postId": "1234567"
  }
}
```

### getPostComments
Get comments for a specific post with advanced sorting and depth control.

```json
{
  "tool": "getPostComments",
  "parameters": {
    "subreddit": "science",
    "postId": "abcdef",
    "sort": "top",
    "limit": 100,
    "depth": 5
  }
}
```

Get newest comments:
```json
{
  "tool": "getPostComments",
  "parameters": {
    "subreddit": "technology",
    "postId": "xyz123",
    "sort": "new",
    "limit": 50
  }
}
```

### getPostsByIds
Retrieve multiple posts using their full Reddit IDs.

```json
{
  "tool": "getPostsByIds",
  "parameters": {
    "postIds": "t3_1234567,t3_abcdefg,t3_xyz9876"
  }
}
```

### getAllPosts
Get posts from Reddit's front page (r/all).

```json
{
  "tool": "getAllPosts",
  "parameters": {
    "sort": "hot",
    "limit": 25
  }
}
```

Get top posts from r/all for the past day:
```json
{
  "tool": "getAllPosts",
  "parameters": {
    "sort": "top",
    "time": "day",
    "limit": 50
  }
}
```

### getRandomPost
Get a random post from Reddit or from a specific subreddit.

Random post from all of Reddit:
```json
{
  "tool": "getRandomPost",
  "parameters": {}
}
```

Random post from a specific subreddit:
```json
{
  "tool": "getRandomPost",
  "parameters": {
    "subreddit": "todayilearned"
  }
}
```

## User Tools

### getUserProfile
Get public profile information for any Reddit user.

```json
{
  "tool": "getUserProfile",
  "parameters": {
    "username": "spez"
  }
}
```

### getUserPosts
Get posts submitted by a specific user.

```json
{
  "tool": "getUserPosts",
  "parameters": {
    "username": "AutoModerator",
    "sort": "new",
    "limit": 10
  }
}
```

Get user's top posts from the past year:
```json
{
  "tool": "getUserPosts",
  "parameters": {
    "username": "example_user",
    "sort": "top",
    "time": "year",
    "limit": 25
  }
}
```

### getUserComments
Get comments posted by a specific user.

```json
{
  "tool": "getUserComments",
  "parameters": {
    "username": "example_user",
    "sort": "new",
    "limit": 20
  }
}
```

### getUserTrophies
Get trophies and achievements for a specific user.

```json
{
  "tool": "getUserTrophies",
  "parameters": {
    "username": "spez"
  }
}
```

## Search Tools

### searchReddit
Perform comprehensive searches across Reddit.

Search all of Reddit:
```json
{
  "tool": "searchReddit",
  "parameters": {
    "query": "artificial intelligence",
    "sort": "relevance",
    "time": "week",
    "limit": 25
  }
}
```

Search within a specific subreddit:
```json
{
  "tool": "searchReddit",
  "parameters": {
    "query": "machine learning",
    "subreddit": "programming",
    "sort": "top",
    "time": "month",
    "limit": 50
  }
}
```

Search for subreddits:
```json
{
  "tool": "searchReddit",
  "parameters": {
    "query": "cooking",
    "type": "sr",
    "sort": "relevance",
    "limit": 20
  }
}
```

Search for users:
```json
{
  "tool": "searchReddit",
  "parameters": {
    "query": "developer",
    "type": "user",
    "sort": "relevance",
    "limit": 15
  }
}
```

## Advanced Usage Patterns

### Pagination Example
When dealing with large datasets, use pagination to retrieve all results:

```json
// First request
{
  "tool": "getSubredditPosts",
  "parameters": {
    "subreddit": "technology",
    "sort": "hot",
    "limit": 25
  }
}

// Use the 'after' value from the response for the next page
{
  "tool": "getSubredditPosts",
  "parameters": {
    "subreddit": "technology",
    "sort": "hot",
    "limit": 25,
    "after": "t3_1a2b3c4d"
  }
}
```

### Research Workflow Example
A typical research workflow might involve:

1. **Discover subreddits** related to your topic:
```json
{
  "tool": "searchReddit",
  "parameters": {
    "query": "climate change",
    "type": "sr",
    "limit": 10
  }
}
```

2. **Get subreddit information** to understand the community:
```json
{
  "tool": "getSubredditInfo",
  "parameters": {
    "subreddit": "climatechange"
  }
}
```

3. **Get recent top posts** from the subreddit:
```json
{
  "tool": "getSubredditPosts",
  "parameters": {
    "subreddit": "climatechange",
    "sort": "top",
    "time": "week",
    "limit": 50
  }
}
```

4. **Analyze specific posts** and their comments:
```json
{
  "tool": "getPostComments",
  "parameters": {
    "subreddit": "climatechange",
    "postId": "abc123",
    "sort": "top",
    "limit": 100,
    "depth": 3
  }
}
```

### User Analysis Example
To analyze a user's activity:

1. **Get user profile**:
```json
{
  "tool": "getUserProfile",
  "parameters": {
    "username": "target_user"
  }
}
```

2. **Get their recent posts**:
```json
{
  "tool": "getUserPosts",
  "parameters": {
    "username": "target_user",
    "sort": "new",
    "limit": 50
  }
}
```

3. **Get their recent comments**:
```json
{
  "tool": "getUserComments",
  "parameters": {
    "username": "target_user",
    "sort": "new",
    "limit": 100
  }
}
```

4. **Check their achievements**:
```json
{
  "tool": "getUserTrophies",
  "parameters": {
    "username": "target_user"
  }
}
```

## Error Handling

The server provides helpful error messages. Common scenarios:

- **Invalid subreddit**: `{"error": "Subreddit not found"}`
- **Invalid user**: `{"error": "User not found"}`
- **Rate limit**: `{"error": "Rate limit exceeded"}`
- **API credentials**: `{"error": "Reddit API credentials not configured"}`

## Best Practices

1. **Use specific limits**: Don't request more data than you need
2. **Implement pagination**: For large datasets, use the `after` parameter
3. **Cache responses**: Avoid redundant API calls
4. **Respect rate limits**: Reddit allows 60 requests per minute
5. **Use appropriate sorting**: Choose the right sort method for your use case
6. **Filter by time**: Use time parameters to get relevant recent content
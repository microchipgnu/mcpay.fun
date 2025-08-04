# Perplexity MCP Server

A Model Context Protocol (MCP) server that provides access to Perplexity's Sonar API for real-time search and research capabilities.

## Features

This MCP server provides 8 powerful tools for accessing Perplexity's AI-powered search capabilities:

### Search Tools
- **search** - Perform real-time web search with customizable parameters
- **quickAnswer** - Get concise answers to questions
- **newsSearch** - Search for current news and recent events
- **academicSearch** - Perform academic research with scholarly focus

### Research Tools
- **deepResearch** - Comprehensive research on complex topics
- **conversationalSearch** - Multi-turn conversations with search capabilities
- **compare** - Compare multiple topics, concepts, or entities
- **factCheck** - Verify claims and fact-check statements

## What Makes This Special

- **Real-time Information**: Access current web data and recent developments
- **Authoritative Sources**: Get properly cited information from reliable sources
- **Optimized Models**: Each tool uses the best model for its specific purpose
- **Specialized Modes**: Academic research, news, fact-checking, and comparison tools
- **Simplified Interface**: Easy-to-use tools with minimal required parameters

## Setup

### 1. Get Perplexity API Key
1. Visit [Perplexity API](https://docs.perplexity.ai)
2. Sign up for an account
3. Navigate to API settings and generate an API key
4. Add billing information and purchase credits

### 2. Environment Configuration
Set up your environment variables:
```bash
# Required: Your Perplexity API key
PERPLEXITY_API_KEY=your_perplexity_api_key_here

# Optional: For MCP server authentication
VALID_KEYS=your_mcp_server_api_key_1,your_mcp_server_api_key_2
```

### 3. Deploy to Vercel
```bash
# Navigate to the project directory
cd mcp-examples/perplexity.ai

# Set environment variables in Vercel
vercel env add PERPLEXITY_API_KEY

# Deploy to Vercel
vercel deploy
```

## Usage Examples

### Basic Search
```json
{
  "tool": "search",
  "parameters": {
    "query": "latest developments in artificial intelligence 2024",
    "model": "sonar-pro"
  }
}
```

### Academic Research
```json
{
  "tool": "academicSearch",
  "parameters": {
    "query": "machine learning applications in healthcare",
    "focus": "academic"
  }
}
```

### News Search
```json
{
  "tool": "newsSearch",
  "parameters": {
    "query": "climate change policy updates",
    "recency": "week"
  }
}
```

### Quick Answer
```json
{
  "tool": "quickAnswer",
  "parameters": {
    "question": "What is the current population of Tokyo?"
  }
}
```

### Deep Research
```json
{
  "tool": "deepResearch",
  "parameters": {
    "topic": "renewable energy technologies",
    "aspects": ["solar power", "wind energy", "energy storage", "market trends"]
  }
}
```

### Comparison
```json
{
  "tool": "compare",
  "parameters": {
    "items": ["ChatGPT", "Claude", "Gemini"],
    "criteria": ["capabilities", "pricing", "use cases"]
  }
}
```

### Fact Checking
```json
{
  "tool": "factCheck",
  "parameters": {
    "claim": "The Great Wall of China is visible from space"
  }
}
```

### Conversational Search
```json
{
  "tool": "conversationalSearch",
  "parameters": {
    "messages": [
      {
        "role": "system",
        "content": "You are a helpful research assistant."
      },
      {
        "role": "user",
        "content": "Tell me about quantum computing"
      },
      {
        "role": "assistant",
        "content": "Quantum computing is a revolutionary technology..."
      },
      {
        "role": "user",
        "content": "What are the latest breakthroughs in 2024?"
      }
    ]
  }
}
```

## Model Usage

Each tool is automatically configured with the optimal model for its purpose:

- **search**: Uses sonar-pro (configurable) for comprehensive web search
- **quickAnswer**: Uses sonar-small for fast, concise responses
- **newsSearch**: Uses sonar-pro for current events and news
- **academicSearch**: Uses sonar-pro for scholarly research
- **deepResearch**: Uses sonar-pro for comprehensive analysis
- **conversationalSearch**: Uses sonar-pro for multi-turn conversations
- **compare**: Uses sonar-pro for detailed comparisons
- **factCheck**: Uses sonar-pro for authoritative fact-checking

## Built-in Optimizations

Each tool comes pre-configured with optimal settings:

### Smart Filtering
- **academicSearch**: Automatically filters to educational and authoritative domains (.edu, .org, .gov)
- **newsSearch**: Configured for news websites and current information
- **factCheck**: Focuses on government, educational, and organizational sources

### Optimized Parameters
- **Temperature**: Set appropriately for each tool (0.1 for fact-checking, 0.4 for conversations)
- **Citations**: Enabled by default for all tools to provide source transparency
- **Token Limits**: Configured per tool (150 for quick answers, 2000 for deep research)

### Recency Control
- **newsSearch**: Supports recency filtering (`hour`, `day`, `week`, `month`)
- Other tools use current web data by default

## Response Format

All tools return responses in this format:
```json
{
  "id": "response_id",
  "model": "sonar-pro",
  "created": 1640995200,
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 200,
    "total_tokens": 250,
    "search_context_size": "1000",
    "citation_tokens": 100,
    "num_search_queries": 3
  },
  "object": "chat.completion",
  "choices": [
    {
      "index": 0,
      "finish_reason": "stop",
      "message": {
        "content": "Response content with citations...",
        "role": "assistant"
      }
    }
  ],
  "citations": [
    "https://example.com/source1",
    "https://example.com/source2"
  ],
  "search_results": [
    {
      "title": "Article Title",
      "url": "https://example.com/article",
      "date": "2024-01-15"
    }
  ]
}
```

## Pricing Considerations

Perplexity uses a credit-based pricing system:
- **sonar-pro**: Higher cost, comprehensive results
- **sonar**: Moderate cost, balanced performance
- **sonar-small**: Lower cost, basic queries
- **Search operations**: Additional cost per search query
- **Citation processing**: Additional cost for citation tokens

### Cost Optimization Tips
1. Use appropriate model for the task complexity
2. Set reasonable `max_tokens` limits
3. Use `sonar-small` for simple questions
4. Implement caching for repeated queries
5. Monitor usage through response metadata

## Error Handling

The server provides detailed error messages for common issues:
- Missing or invalid API keys (`PERPLEXITY_API_KEY not configured`)
- Rate limit exceeded
- Invalid model names or parameters
- Network connectivity issues
- Insufficient credits

## Use Cases

### Research & Analysis
- Academic research with scholarly sources
- Market research and competitive analysis
- Current events and news monitoring
- Fact-checking and verification

### Content Creation
- Research for articles and blog posts
- Background information for presentations
- Citation and source gathering
- Trend analysis and insights

### Decision Support
- Comparative analysis of options
- Real-time information for decisions
- Verification of claims and facts
- Current market conditions

### Education & Learning
- Academic research assistance
- Homework and assignment help
- Current affairs and news analysis
- Scientific and technical explanations

## Security & Privacy

- API keys are stored as environment variables
- All requests use HTTPS encryption
- No user data is cached or stored
- Citations provide transparency
- Follow Perplexity's terms of service

## Limitations

- Requires Perplexity API credits
- Rate limits apply based on your plan
- Some models may have higher latency
- Real-time search may have occasional delays
- Citation availability depends on source accessibility

## Support

- Perplexity Documentation: [docs.perplexity.ai](https://docs.perplexity.ai)
- MCP Protocol: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- Issues: Create an issue in this repository

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the ISC License. See the LICENSE file for details.
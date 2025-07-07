import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";

const VALID_KEYS = process.env.VALID_KEYS?.split(",");
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_API_BASE = "https://api.perplexity.ai";

// Helper function to make Perplexity API requests
async function makePerplexityRequest(messages: any[], model: string = "sonar-pro", options: Record<string, any> = {}) {
  if (!PERPLEXITY_API_KEY) {
    throw new Error("PERPLEXITY_API_KEY environment variable is required");
  }

  const requestBody = {
    model,
    messages,
    ...options
  };

  const response = await fetch(`${PERPLEXITY_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Perplexity API request failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

const handler = createMcpHandler((server) => {
  // Basic Search Tool
  server.tool(
    "search",
    "Perform a real-time web search using Perplexity's Sonar model",
    {
      query: z.string().describe("The search query or question"),
      model: z.enum(["sonar-pro", "sonar", "sonar-small"]).optional().default("sonar-pro").describe("The Sonar model to use")
    },
    async ({ query, model }) => {
      const messages = [
        {
          role: "system",
          content: "You are a helpful research assistant. Provide accurate, up-to-date information with proper citations."
        },
        {
          role: "user",
          content: query
        }
      ];

      const options: Record<string, any> = {
        temperature: 0.2,
        return_citations: true,
        return_images: false
      };

      const data = await makePerplexityRequest(messages, model, options);
      
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2) 
        }] 
      };
    }
  );

  // Academic Research Tool
  server.tool(
    "academicSearch",
    "Perform academic research using Perplexity with academic focus",
    {
      query: z.string().describe("The academic research query"),
      focus: z.enum(["academic", "writing", "math", "programming"]).optional().default("academic").describe("Research focus mode")
    },
    async ({ query, focus }) => {
      const systemPrompts = {
        academic: "You are an academic researcher. Provide scholarly, well-cited information from reputable academic sources. Focus on peer-reviewed papers, academic institutions, and authoritative educational content.",
        writing: "You are a writing research assistant. Help with research for academic writing, providing credible sources, proper citations, and comprehensive information for essays, papers, and articles.",
        math: "You are a mathematics research assistant. Provide detailed mathematical explanations, proofs, formulas, and examples from authoritative mathematical sources.",
        programming: "You are a programming research assistant. Provide technical programming information, best practices, code examples, and documentation from reliable programming resources."
      };

      const messages = [
        {
          role: "system",
          content: systemPrompts[focus]
        },
        {
          role: "user",
          content: query
        }
      ];

      const options: Record<string, any> = {
        temperature: 0.1, // Lower temperature for more factual responses
        return_citations: true,
        search_domain_filter: ["edu", "org", "gov"] // Focus on educational and authoritative domains
      };

      const data = await makePerplexityRequest(messages, "sonar-pro", options);
      
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2) 
        }] 
      };
    }
  );

  // News and Current Events Tool
  server.tool(
    "newsSearch",
    "Search for current news and recent events",
    {
      query: z.string().describe("The news query or topic"),
      recency: z.enum(["hour", "day", "week", "month"]).optional().default("day").describe("How recent the news should be")
    },
    async ({ query, recency }) => {
      const systemContent = "You are a news research assistant. Provide current, factual news information with proper citations. Focus on recent developments and breaking news.";

      const messages = [
        {
          role: "system",
          content: systemContent
        },
        {
          role: "user",
          content: query
        }
      ];

      const options: Record<string, any> = {
        temperature: 0.3,
        return_citations: true,
        search_recency_filter: recency,
        search_domain_filter: ["com", "org", "net"] // Include news websites
      };

      const data = await makePerplexityRequest(messages, "sonar-pro", options);
      
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2) 
        }] 
      };
    }
  );

  // Conversational Search Tool
  server.tool(
    "conversationalSearch",
    "Have a multi-turn conversation with search capabilities",
    {
      messages: z.array(z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string()
      })).describe("Array of conversation messages")
    },
    async ({ messages }) => {
      const options: Record<string, any> = {
        temperature: 0.4,
        return_citations: true
      };

      const data = await makePerplexityRequest(messages, "sonar-pro", options);
      
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2) 
        }] 
      };
    }
  );

  // Quick Answer Tool
  server.tool(
    "quickAnswer",
    "Get a quick, concise answer to a question",
    {
      question: z.string().describe("The question to answer")
    },
    async ({ question }) => {
      const messages = [
        {
          role: "system",
          content: "You are a helpful assistant. Provide concise, accurate answers. Be brief but informative."
        },
        {
          role: "user",
          content: question
        }
      ];

      const options = {
        temperature: 0.1,
        max_tokens: 150,
        return_citations: true
      };

      const data = await makePerplexityRequest(messages, "sonar-small", options);
      
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2) 
        }] 
      };
    }
  );

  // Deep Research Tool
  server.tool(
    "deepResearch",
    "Perform comprehensive research on a complex topic",
    {
      topic: z.string().describe("The topic to research in depth"),
      aspects: z.array(z.string()).optional().describe("Specific aspects or angles to focus on")
    },
    async ({ topic, aspects }) => {
      let systemContent = "You are a comprehensive research assistant. Provide detailed, well-structured research with multiple perspectives, key findings, and authoritative sources.";
      
      let userContent = `Research the topic: "${topic}"`;
      
      if (aspects && aspects.length > 0) {
        userContent += `\n\nFocus on these specific aspects:\n${aspects.map(aspect => `- ${aspect}`).join('\n')}`;
      }
      
      userContent += "\n\nProvide a comprehensive analysis including:\n- Key findings and insights\n- Multiple perspectives\n- Current developments\n- Authoritative sources and citations\n- Summary of main points";

      const messages = [
        {
          role: "system",
          content: systemContent
        },
        {
          role: "user",
          content: userContent
        }
      ];

      const options = {
        temperature: 0.2,
        max_tokens: 2000,
        return_citations: true,
        return_images: false
      };

      const data = await makePerplexityRequest(messages, "sonar-pro", options);
      
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2) 
        }] 
      };
    }
  );

  // Compare Tool
  server.tool(
    "compare",
    "Compare two or more topics, concepts, or entities",
    {
      items: z.array(z.string()).min(2).describe("Items to compare (minimum 2)"),
      criteria: z.array(z.string()).optional().describe("Specific criteria for comparison")
    },
    async ({ items, criteria }) => {
      let userContent = `Compare the following: ${items.join(" vs ")}`;
      
      if (criteria && criteria.length > 0) {
        userContent += `\n\nFocus the comparison on these criteria:\n${criteria.map(c => `- ${c}`).join('\n')}`;
      }
      
      userContent += "\n\nProvide a structured comparison with:\n- Key similarities and differences\n- Pros and cons of each\n- Use cases or applications\n- Current market position or status\n- Authoritative sources";

      const messages = [
        {
          role: "system",
          content: "You are a comparison research assistant. Provide balanced, factual comparisons with clear structure and reliable sources."
        },
        {
          role: "user",
          content: userContent
        }
      ];

      const options: Record<string, any> = {
        temperature: 0.2,
        return_citations: true
      };

      const data = await makePerplexityRequest(messages, "sonar-pro", options);
      
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2) 
        }] 
      };
    }
  );

  // Fact Check Tool
  server.tool(
    "factCheck",
    "Verify claims and fact-check statements",
    {
      claim: z.string().describe("The claim or statement to fact-check")
    },
    async ({ claim }) => {
      const messages = [
        {
          role: "system",
          content: "You are a fact-checking assistant. Verify claims using authoritative sources. Provide clear verdicts (True, False, Partially True, Unverified) with detailed explanations and reliable sources."
        },
        {
          role: "user",
          content: `Fact-check this claim: "${claim}"\n\nProvide:\n- Verdict (True/False/Partially True/Unverified)\n- Detailed explanation\n- Supporting or contradicting evidence\n- Authoritative sources\n- Context and nuances`
        }
      ];

      const options: Record<string, any> = {
        temperature: 0.1, // Very low temperature for factual accuracy
        return_citations: true,
        search_domain_filter: ["gov", "edu", "org"] // Focus on authoritative domains
      };

      const data = await makePerplexityRequest(messages, "sonar-pro", options);
      
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
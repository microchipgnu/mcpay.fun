// api/openmcp.ts
import { createMcpHandler, experimental_withMcpAuth } from "@vercel/mcp-adapter";
import { Sandbox } from "@vercel/sandbox";
import { Ajv } from "ajv";
import { z } from "zod";
import { openmcpSchema } from "../lib/openmcp-schema.js";
import { type Context, Hono } from "hono";
import dotenv from "dotenv";
dotenv.config();

console.log('[OpenMCP] Initializing OpenMCP API module');

const app = new Hono()

// Define TypeScript interfaces based on the schema
interface ToolImplementation {
    language: "python" | "javascript";
    entrypoint: string;
    code: string;
}

interface Tool {
    name: string;
    description?: string;
    inputSchema: object;
    outputSchema?: object;
    streaming?: boolean;
    implementation: ToolImplementation;
}

interface OpenMCPManifest {
    id: string;
    name: string;
    version: string;
    description?: string;
    runtime: any; // Could be object or array based on schema
    tools: Tool[];
    dependencies?: {
        pip?: string[];
        npm?: string[];
    };
    environment?: Record<string, string>;
    security?: {
        networkAccess?: boolean;
        sandboxPermissions?: string[];
    };
}

const ajv = new Ajv()
console.log('[OpenMCP] AJV validator initialized');

// Helper function to convert JSON Schema to Zod raw shape
function jsonSchemaToZodShape(jsonSchema: any): Record<string, z.ZodType<any>> {
    console.log(`[OpenMCP] Converting JSON Schema to Zod shape:`, JSON.stringify(jsonSchema, null, 2));

    if (jsonSchema.type === "object") {
        const shape: Record<string, z.ZodType<any>> = {};
        const properties = jsonSchema.properties || {};
        const required = jsonSchema.required || [];

        for (const [key, prop] of Object.entries(properties) as [string, any][]) {
            let zodType: z.ZodType<any>;

            switch (prop.type) {
                case "string":
                    zodType = z.string();
                    break;
                case "number":
                    zodType = z.number();
                    break;
                case "boolean":
                    zodType = z.boolean();
                    break;
                case "array":
                    zodType = z.array(z.any()); // Could be more specific based on items
                    break;
                default:
                    zodType = z.any();
            }

            // Make optional if not in required array
            if (!required.includes(key)) {
                zodType = zodType.optional();
            }

            shape[key] = zodType;
        }

        console.log(`[OpenMCP] Created Zod shape with keys: ${Object.keys(shape).join(', ')}`);
        return shape;
    }

    // Fallback for non-object schemas
    console.log(`[OpenMCP] Unsupported schema type: ${jsonSchema.type}, using empty shape`);
    return {};
}

async function loadManifest(id: string): Promise<OpenMCPManifest> {
    console.log(`[OpenMCP] Loading manifest for ID: ${id}`);

    // Mock manifest data based on ID
    const mockManifests: Record<string, OpenMCPManifest> = {
        "test-calculator": {
            id: "test-calculator",
            name: "Calculator Tool",
            version: "1.0.0",
            description: "A simple calculator tool for basic arithmetic operations",
            runtime: {
                language: "javascript"
            },
            tools: [
                {
                    name: "add",
                    description: "Add two numbers",
                    inputSchema: {
                        type: "object",
                        properties: {
                            a: { type: "number" },
                            b: { type: "number" }
                        },
                        required: ["a", "b"]
                    },
                    implementation: {
                        language: "javascript",
                        entrypoint: "add",
                        code: `
              const args = JSON.parse(process.env.ARGS || '{}');
              const result = args.a + args.b;
              console.log(JSON.stringify({ success: true, result }));
            `
                    }
                },
                {
                    name: "multiply",
                    description: "Multiply two numbers",
                    inputSchema: {
                        type: "object",
                        properties: {
                            a: { type: "number" },
                            b: { type: "number" }
                        },
                        required: ["a", "b"]
                    },
                    implementation: {
                        language: "javascript",
                        entrypoint: "multiply",
                        code: `
              const args = JSON.parse(process.env.ARGS || '{}');
              const result = args.a * args.b;
              console.log(JSON.stringify({ success: true, result }));
            `
                    }
                }
            ],
            dependencies: {
                npm: []
            },
            environment: {},
            security: {
                networkAccess: false,
                sandboxPermissions: []
            }
        },
        "test-datetime": {
            id: "test-datetime",
            name: "DateTime Tool",
            version: "1.0.0",
            description: "Tools for working with dates and times",
            runtime: {
                language: "javascript"
            },
            tools: [
                {
                    name: "current_time",
                    description: "Get the current timestamp",
                    inputSchema: {
                        type: "object",
                        properties: {},
                        required: []
                    },
                    implementation: {
                        language: "javascript",
                        entrypoint: "current_time",
                        code: `
              const result = new Date().toISOString();
              console.log(JSON.stringify({ success: true, result }));
            `
                    }
                },
                {
                    name: "format_date",
                    description: "Format a date string",
                    inputSchema: {
                        type: "object",
                        properties: {
                            date: { type: "string" },
                            format: { type: "string" }
                        },
                        required: ["date"]
                    },
                    implementation: {
                        language: "javascript",
                        entrypoint: "format_date",
                        code: `
              const args = JSON.parse(process.env.ARGS || '{}');
              const date = new Date(args.date);
              const result = args.format ? date.toLocaleDateString('en-US') : date.toISOString();
              console.log(JSON.stringify({ success: true, result }));
            `
                    }
                }
            ],
            dependencies: {
                npm: []
            },
            environment: {},
            security: {
                networkAccess: false,
                sandboxPermissions: []
            }
        }
    };

    console.log(`[OpenMCP] Available manifests: ${Object.keys(mockManifests).join(', ')}`);

    let manifest = mockManifests[id];
    if (!manifest) {
        console.error(`[OpenMCP] Manifest not found for ID: ${id}`);
        throw new Error(`Manifest not found for ID: ${id}`);
    }

    console.log(`[OpenMCP] Found manifest for ${id}: ${manifest.name} v${manifest.version}`);
    console.log(`[OpenMCP] Manifest tools: ${manifest.tools.map(t => t.name).join(', ')}`);

    const validate = ajv.compile(openmcpSchema);
    console.log(`[OpenMCP] Validating manifest against schema for ${id}`);

    if (!validate(manifest)) {
        console.error(`[OpenMCP] Invalid manifest for ${id}:`, validate.errors);
        throw new Error("Invalid manifest");
    }

    console.log(`[OpenMCP] Manifest validation successful for ${id}`);
    return manifest;
}

export const createHandler = (id: string) => {
    console.log(`[OpenMCP] Creating MCP handler for ID: ${id}`);

    return createMcpHandler(async (server) => {
        console.log(`[OpenMCP] Initializing MCP server for ${id}`);

        const manifest = await loadManifest(id);
        console.log(`[OpenMCP] Loaded manifest, registering ${manifest.tools.length} tools`);

        for (const tool of manifest.tools) {
            console.log(`[OpenMCP] Registering tool: ${tool.name} (${tool.implementation.language})`);

            // Convert JSON Schema to Zod shape
            const zodShape = jsonSchemaToZodShape(tool.inputSchema);
            console.log(`[OpenMCP] Converted input schema to Zod shape for tool: ${tool.name}`);

            server.tool(
                tool.name,
                tool.description || `Tool: ${tool.name}`,
                zodShape,
                async (args: any, context: any) => {
                    console.log(`[OpenMCP] Executing tool: ${tool.name} with args:`, args);
                    console.log(`[OpenMCP] Args validation successful for tool: ${tool.name}`);
                    const result = await executeTool(tool, args, manifest);
                    console.log(`[OpenMCP] Tool ${tool.name} execution completed:`, result);
                    return result;
                }
            );
        }

        console.log(`[OpenMCP] All tools registered for ${id}`);
    }, { serverInfo: { name: "openmcp", version: "1.0.0" } }, {
        onEvent(event) {
            console.log(`[OpenMCP] MCP event:`, event);
        },
    });
};

async function executeTool(tool: any, args: any, manifest: OpenMCPManifest): Promise<any> {
    console.log(`[OpenMCP] Executing tool: ${tool.name} with language: ${tool.implementation.language}`);
    console.log(`[OpenMCP] Tool args:`, JSON.stringify(args, null, 2));

    if (tool.implementation.language === "javascript") {
        console.log(`[OpenMCP] Executing JavaScript tool: ${tool.name}`);
        return runJsTool(tool, args, manifest);
    }
    if (tool.implementation.language === "python") {
        console.error(`[OpenMCP] Python tools not supported yet for tool: ${tool.name}`);
        throw new Error("Python tools are not supported yet");
    }

    console.error(`[OpenMCP] Unsupported language: ${tool.implementation.language} for tool: ${tool.name}`);
    throw new Error("Unsupported language");
}


async function runJsTool(tool: Tool, args: any, manifest: OpenMCPManifest): Promise<any> {
    console.log(`[OpenMCP] Starting JavaScript tool execution: ${tool.name}`);
    console.log(`[OpenMCP] Tool code length: ${tool.implementation.code.length} characters`);

    // Create a sandbox with an empty Git repository
    console.log(`[OpenMCP] Creating sandbox with runtime: ${manifest.runtime}`);

    let sandbox: Sandbox;

    try {
        sandbox = await Sandbox.create({
            runtime: 'node22',
            resources: { vcpus: 2 },
            timeout: 120 * 1000, // 120 seconds
        });
    } catch (error) {
        console.error(`[OpenMCP] Error creating sandbox:`, error);
        throw error;
    }

    console.log(`[OpenMCP] Sandbox created successfully for tool: ${tool.name}`);

    try {
        // Install npm dependencies if specified
        if (manifest.dependencies?.npm && manifest.dependencies.npm.length > 0) {
            console.log(`[OpenMCP] Installing npm dependencies: ${manifest.dependencies.npm.join(', ')}`);

            const installExecution = await sandbox.runCommand({
                cmd: 'npm',
                args: ['install', '--no-package-lock', ...manifest.dependencies.npm],
            });

            // Check if installation was successful
            const exitCode = installExecution.exitCode;
            console.log(`[OpenMCP] npm install exit code: ${exitCode}`);

            if (exitCode !== 0) {
                const stderr = await installExecution.stderr();
                console.error(`[OpenMCP] Failed to install npm dependencies for ${tool.name}:`, stderr);
                return { content: [{ type: "text", text: `Error installing dependencies: ${stderr}` }] };
            }

            console.log(`[OpenMCP] npm dependencies installed successfully for ${tool.name}`);
        } else {
            console.log(`[OpenMCP] No npm dependencies to install for ${tool.name}`);
        }

        // Create the complete execution script that includes the tool code
        const executionScript = tool.implementation.code;
        console.log(`[OpenMCP] Executing script for ${tool.name}`);
        console.log(`[OpenMCP] Script content preview: ${executionScript.substring(0, 200)}...`);

        // Execute the script directly using node -e
        const execution = await sandbox.runCommand({
            cmd: 'node',
            args: ['-e', executionScript],
            env: {
                ...manifest.environment,
                ARGS: JSON.stringify(args)
            },
        });

        console.log(`[OpenMCP] Command executed for ${tool.name}, waiting for output`);

        let output;
        try {
            const stdout = await execution.stdout();
            const stderr = await execution.stderr();
            const outputText = stdout || stderr;

            console.log(`[OpenMCP] Raw output for ${tool.name}:`, { stdout, stderr });
            console.log(`[OpenMCP] Parsing output text: ${outputText}`);

            output = JSON.parse(outputText);
            console.log(`[OpenMCP] Parsed output for ${tool.name}:`, output);
        } catch (parseError) {
            const stdout = await execution.stdout();
            const stderr = await execution.stderr();
            console.error(`[OpenMCP] Failed to parse tool output for ${tool.name}:`, parseError);
            console.error(`[OpenMCP] Raw stdout:`, stdout);
            console.error(`[OpenMCP] Raw stderr:`, stderr);

            output = { success: false, error: 'Failed to parse tool output', stdout, stderr };
        }

        if (output.success) {
            console.log(`[OpenMCP] Tool ${tool.name} executed successfully with result:`, output.result);
            return { content: [{ type: "text", text: JSON.stringify(output.result) }] };
        } else {
            console.error(`[OpenMCP] Tool ${tool.name} execution failed:`, output.error);
            return { content: [{ type: "text", text: `Error: ${output.error}` }] };
        }

    } catch (error) {
        console.error(`[OpenMCP] Exception during tool execution for ${tool.name}:`, error);
        throw error;
    } finally {
        console.log(`[OpenMCP] Stopping sandbox for tool: ${tool.name}`);
        await sandbox.stop();
        console.log(`[OpenMCP] Sandbox stopped for tool: ${tool.name}`);
    }
}

const wrappedHandler = async (req: Request, { id }: { id: string }) => {
    console.log(`[OpenMCP] Wrapped handler called for ID: ${id}`);
    console.log(`[OpenMCP] Request URL: ${req.url}`);
    console.log(`[OpenMCP] Request method: ${req.method}`);

    const handler = createHandler(id);
    console.log(`[OpenMCP] Handler created, applying auth wrapper`);

    const authHandler = experimental_withMcpAuth(handler, (req: Request) => {
        console.log(`[OpenMCP] Auth handler called for ${id}`);
        console.log(`[OpenMCP] Auth request URL: ${req.url}`);

        return Promise.resolve({
            token: "",
            extra: {
                id: id
            },
            clientId: "mcpay.fun-backend",
            scopes: ["*"],
        });
    });

    console.log(`[OpenMCP] Calling auth handler for ${id}`);
    const response = await authHandler(req);
    console.log(`[OpenMCP] Auth handler completed for ${id}, response status: ${response.status}`);

    return response;
};

// Add routes for MCP handling
app.all('/*', async (c: Context) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] MCP-v2 request: ${c.req.method} ${c.req.url}`);

    const query = c.req.query();
    const id = query.id;

    console.log(`[OpenMCP] Initial ID from URL: ${id}`);
    console.log(`[OpenMCP] Full path: ${c.req.path}`);


    console.log(`[OpenMCP] Processing request for ID: ${id}`);
    console.log(`[OpenMCP] Request path: ${c.req.path}`);
    console.log(`[OpenMCP] Request headers:`, Object.fromEntries(c.req.raw.headers.entries()));

    try {
        // Convert Hono context to standard Request and get response
        console.log(`[OpenMCP] Calling wrapped handler for ${id}`);

        // const response = await createHandler(id)(c.req.raw);
        const response = await wrappedHandler(c.req.raw, { id: id || "" });
        console.log(`[OpenMCP] Response:`, response);

        console.log(`[OpenMCP] Wrapped handler completed for ${id}, status: ${response.status}`);

        // Return the response through Hono
        return response;
    } catch (error) {
        console.error(`[OpenMCP] Error processing request for ${id}:`, error);
        throw error;
    }
});

console.log('[OpenMCP] OpenMCP API module initialization complete');

export default app;
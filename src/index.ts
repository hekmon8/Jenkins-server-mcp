#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

const JENKINS_URL = process.env.JENKINS_URL || '';
const JENKINS_USER = process.env.JENKINS_USER || '';
const JENKINS_TOKEN = process.env.JENKINS_TOKEN || '';

interface BuildStatus {
  building: boolean;
  result: string | null;
  timestamp: number;
  duration: number;
  url: string;
}

class JenkinsServer {
  private server: Server;
  private axiosInstance;

  constructor() {
    this.server = new Server(
      {
        name: 'jenkins-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.axiosInstance = axios.create({
      baseURL: JENKINS_URL,
      auth: {
        username: JENKINS_USER,
        password: JENKINS_TOKEN,
      },
    });

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_build_status',
          description: 'Get the status of a Jenkins build',
          inputSchema: {
            type: 'object',
            properties: {
              jobPath: {
                type: 'string',
                description: 'Path to the Jenkins job (e.g., "view/xxx_debug")',
              },
              buildNumber: {
                type: 'string',
                description: 'Build number (use "lastBuild" for most recent)',
              },
            },
            required: ['jobPath'],
          },
        },
        {
          name: 'trigger_build',
          description: 'Trigger a new Jenkins build',
          inputSchema: {
            type: 'object',
            properties: {
              jobPath: {
                type: 'string',
                description: 'Path to the Jenkins job',
              },
              parameters: {
                type: 'object',
                description: 'Build parameters (optional)',
                additionalProperties: true,
              },
            },
            required: ['jobPath', 'parameters'],
          },
        },
        {
          name: 'get_build_log',
          description: 'Get the console output of a Jenkins build',
          inputSchema: {
            type: 'object',
            properties: {
              jobPath: {
                type: 'string',
                description: 'Path to the Jenkins job',
              },
              buildNumber: {
                type: 'string',
                description: 'Build number (use "lastBuild" for most recent)',
              },
            },
            required: ['jobPath', 'buildNumber'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'get_build_status':
            return await this.getBuildStatus(request.params.arguments);
          case 'trigger_build':
            return await this.triggerBuild(request.params.arguments);
          case 'get_build_log':
            return await this.getBuildLog(request.params.arguments);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        if (axios.isAxiosError(error)) {
          throw new McpError(
            ErrorCode.InternalError,
            `Jenkins API error: ${error.response?.data?.message || error.message}`
          );
        }
        throw new McpError(ErrorCode.InternalError, 'Unknown error occurred');
      }
    });
  }

  private async getBuildStatus(args: any) {
    const buildNumber = args.buildNumber || 'lastBuild';
    const response = await this.axiosInstance.get<BuildStatus>(
      `/${args.jobPath}/${buildNumber}/api/json`
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            building: response.data.building,
            result: response.data.result,
            timestamp: response.data.timestamp,
            duration: response.data.duration,
            url: response.data.url,
          }, null, 2),
        },
      ],
    };
  }

  private async triggerBuild(args: any) {
    const params = new URLSearchParams();
    if (args.parameters) {
      Object.entries(args.parameters).forEach(([key, value]) => {
        params.append(key, String(value));
      });
    }

    await this.axiosInstance.post(
      `/${args.jobPath}/buildWithParameters`,
      params
    );

    return {
      content: [
        {
          type: 'text',
          text: 'Build triggered successfully',
        },
      ],
    };
  }

  private async getBuildLog(args: any) {
    const response = await this.axiosInstance.get(
      `/${args.jobPath}/${args.buildNumber}/consoleText`
    );

    return {
      content: [
        {
          type: 'text',
          text: response.data,
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Jenkins MCP server running on stdio');
  }
}

const server = new JenkinsServer();
server.run().catch(console.error);

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
  private axiosInstance: any;

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
          name: 'list_recent_failed_jobs',
          description:
            'List Jenkins jobs whose most recent build failed, sorted by most recent failure time.',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximum number of failed jobs to return',
                default: 10,
              },
            },
            required: [],
          },
        },
        {
          name: 'count_failed_jobs',
          description:
            'Count how many Jenkins jobs currently have their last build in FAILURE state.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'get_failed_build_log',
          description:
            'Get the console output of the last failed build for a given Jenkins job.',
          inputSchema: {
            type: 'object',
            properties: {
              jobPath: {
                type: 'string',
                description:
                  'Path to the Jenkins job (e.g., "job/MyJob" or "view/xxx/job/MyJob")',
              },
            },
            required: ['jobPath'],
          },
        },
        {
          name: 'create_jenkins_user',
          description:
            'Create a new Jenkins user in the internal user database. Requires admin permissions.',
          inputSchema: {
            type: 'object',
            properties: {
              username: { type: 'string', description: 'Username for the new account' },
              password: { type: 'string', description: 'Password for the new account' },
              fullName: { type: 'string', description: 'Full name of the user' },
              email: {
                type: 'string',
                description: 'Email address of the user (optional)',
              },
            },
            required: ['username', 'password'],
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
          case 'list_recent_failed_jobs':
            return await this.listRecentFailedJobs(request.params.arguments);
          case 'count_failed_jobs':
            return await this.countFailedJobs();
          case 'get_failed_build_log':
            return await this.getFailedBuildLog(request.params.arguments);
          case 'create_jenkins_user':
            return await this.createJenkinsUser(request.params.arguments);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error: any) {
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

  // --------- Existing tools ---------

  private async getBuildStatus(args: any) {
    const buildNumber = args.buildNumber || 'lastBuild';
    const response = await this.axiosInstance.get(
      `/${args.jobPath}/${buildNumber}/api/json`
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              building: response.data.building,
              result: response.data.result,
              timestamp: response.data.timestamp,
              duration: response.data.duration,
              url: response.data.url,
            },
            null,
            2
          ),
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

    await this.axiosInstance.post(`/${args.jobPath}/buildWithParameters`, params);

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

  // --------- New tools ---------

  // List jobs whose last build is FAILURE, sorted by latest failure time
  private async listRecentFailedJobs(args: any) {
    const limit = args?.limit ?? 10;

    const response = await this.axiosInstance.get('/api/json', {
      params: {
        tree: 'jobs[name,url,lastBuild[number,result,timestamp,url]]',
      },
    });

    const jobs = response.data.jobs || [];

    const failedJobs = jobs
      .filter(
        (job: any) =>
          job.lastBuild &&
          job.lastBuild.result === 'FAILURE' &&
          typeof job.lastBuild.timestamp === 'number'
      )
      .sort(
        (a: any, b: any) => b.lastBuild.timestamp - a.lastBuild.timestamp
      )
      .slice(0, limit)
      .map((job: any) => ({
        name: job.name,
        jobUrl: job.url,
        buildNumber: job.lastBuild.number,
        result: job.lastBuild.result,
        timestamp: job.lastBuild.timestamp,
        buildUrl: job.lastBuild.url,
      }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              count: failedJobs.length,
              failedJobs,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // Count how many jobs have lastBuild.result === FAILURE
  private async countFailedJobs() {
    const response = await this.axiosInstance.get('/api/json', {
      params: {
        tree: 'jobs[name,lastBuild[result]]',
      },
    });

    const jobs = response.data.jobs || [];
    const failedCount = jobs.filter(
      (job: any) => job.lastBuild?.result === 'FAILURE'
    ).length;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              failedJobCount: failedCount,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // Get console log of last failed build for a job
  private async getFailedBuildLog(args: any) {
    if (!args?.jobPath) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'jobPath is required for get_failed_build_log'
      );
    }

    // Get job info including lastFailedBuild
    const jobInfo = await this.axiosInstance.get(`/${args.jobPath}/api/json`, {
      params: {
        tree: 'name,url,lastFailedBuild[number,url]',
      },
    });

    const lastFailedBuild = jobInfo.data.lastFailedBuild;
    if (!lastFailedBuild || !lastFailedBuild.number) {
      return {
        content: [
          {
            type: 'text',
            text: `Job "${jobInfo.data.name}" has no failed builds.`,
          },
        ],
      };
    }

    const buildNumber = lastFailedBuild.number;

    const logResponse = await this.axiosInstance.get(
      `/${args.jobPath}/${buildNumber}/consoleText`
    );

    return {
      content: [
        {
          type: 'text',
          text: logResponse.data,
        },
      ],
    };
  }

  // Create a new Jenkins user (internal user database, admin-only)
  private async createJenkinsUser(args: any) {
    const { username, password, fullName, email } = args || {};
    if (!username || !password) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'username and password are required to create a Jenkins user'
      );
    }

    // Get CSRF crumb
    const crumbResp = await this.axiosInstance.get('/crumbIssuer/api/json');
    const crumbField = crumbResp.data.crumbRequestField;
    const crumbValue = crumbResp.data.crumb;

    const params = new URLSearchParams();
    params.append('username', username);
    params.append('password1', password);
    params.append('password2', password);
    if (fullName) params.append('fullname', fullName);
    if (email) params.append('email', email);

    await this.axiosInstance.post('/securityRealm/createAccountByAdmin', params, {
      headers: {
        [crumbField]: crumbValue,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return {
      content: [
        {
          type: 'text',
          text: `User "${username}" created successfully (assuming internal Jenkins user database).`,
        },
      ],
    };
  }

  // --------- Bootstrap ---------

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Jenkins MCP server running on stdio');
  }
}

const server = new JenkinsServer();
server.run().catch(console.error);

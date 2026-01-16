## Sponsors

| Website | Description |
|---------|-------------|
| [productdirs.com](https://productdirs.com) | Free AI SaaS Product Directory & Listing Platform - Submit your AI products and SaaS tools for free exposure and discovery |
| [thistools.app](https://thistools.app) | Free AI Tools & SaaS Directory for Developers - Discover and list innovative AI-powered tools and SaaS applications |
| [aiimgcombiner.com](https://aiimgcombiner.com) | Free AI-Powered Image Merging & Combination Tool - Merge and combine multiple images effortlessly with AI technology |

---

# Jenkins Server MCP

A Model Context Protocol (MCP) server that provides tools for interacting with Jenkins CI/CD servers. This server enables AI assistants to check build statuses, trigger builds, and retrieve build logs through a standardized interface.

## Installation

1. Clone this repository:
```bash
git clone https://github.com/hekmon8/jenkins-server-mcp.git
cd jenkins-server-mcp
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Configuration

The server requires the following environment variables:

- `JENKINS_URL`: The URL of your Jenkins server
- `JENKINS_USER`: Jenkins username for authentication
- `JENKINS_TOKEN`: Jenkins API token for authentication

Configure these in your MCP settings file:

### For Claude Desktop

MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "jenkins-server": {
      "command": "node",
      "args": ["/path/to/jenkins-server-mcp/build/index.js"],
      "env": {
        "JENKINS_URL": "https://your-jenkins-server.com",
        "JENKINS_USER": "your-username",
        "JENKINS_TOKEN": "your-api-token"
      }
    }
  }
}
```

## Tools and Usage

### 1. Get Build Status

Get the status of a Jenkins build:

```typescript
// Example usage
const result = await mcpClient.useTool("jenkins-server", "get_build_status", {
  jobPath: "view/xxx_debug",
  buildNumber: "lastBuild"  // Optional, defaults to lastBuild
});
```

Input Schema:
```json
{
  "jobPath": "string",  // Path to Jenkins job
  "buildNumber": "string"  // Optional, build number or "lastBuild"
}
```

### 2. Trigger Build

Trigger a new Jenkins build with parameters:

```typescript
// Example usage
const result = await mcpClient.useTool("jenkins-server", "trigger_build", {
  jobPath: "view/xxx_debug",
  parameters: {
    BRANCH: "main",
    BUILD_TYPE: "debug"
  }
});
```

Input Schema:
```json
{
  "jobPath": "string",  // Path to Jenkins job
  "parameters": {
    // Build parameters as key-value pairs
  }
}
```

### 3. Get Build Log

Retrieve the console output of a Jenkins build:

```typescript
// Example usage
const result = await mcpClient.useTool("jenkins-server", "get_build_log", {
  jobPath: "view/xxx_debug",
  buildNumber: "lastBuild"
});
```

Input Schema:
```json
{
  "jobPath": "string",  // Path to Jenkins job
  "buildNumber": "string"  // Build number or "lastBuild"
}
```

## Development

For development with auto-rebuild:
```bash
npm run watch
```

### Debugging

Since MCP servers communicate over stdio, you can use the MCP Inspector for debugging:

```bash
npm run inspector
```

This will provide a URL to access debugging tools in your browser.

## Thanks

Thanks AIMCP(https://www.aimcp.info).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

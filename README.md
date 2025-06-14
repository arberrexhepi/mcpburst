# mcp-hub

Host an express app of streamablehttp and stdio MCP servers that you can use from your own website. (comes with a mini chat dialog to check responses)

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Directory Structure](#directory-structure)
- [Scripts](#scripts)
- [License](#license)

## Features

- Streamable HTTP MCP transport server built on Model Context Protocol SDK
- Demo stdio MCP transport server
- Built-in demo tool (`echo`) for testing
- Express façade handling JSON-RPC at `/mcp` and health checks at `/health`
- Mini front-end chat UI to test MCP responses

## Prerequisites

- Node.js v16 or higher
- npm (included with Node.js)

## Installation

1. Clone the repository:

   ```sh
   git clone https://github.com/arberrexhepi/mcp-hub.git
   cd mcp-hub
   ```

2. Install root dependencies in root:

   ```sh
   npm install
   ```

3. Install hub and server dependencies:

   ```sh
   cd hub && npm install && cd ..
   ```

## Configuration

Create environment variable files in both `hub/` and `server/` directories:

### hub/.env

```ini
PORT=4000
HOST=localhost
MCP_REQUIRE_AUTH=false   # set to 'true' to require Bearer auth NOTE: Work in Progress
GITHUB_API_KEY=         # optional: GitHub Token for tool examples
```

### server/.env

```ini
PORT=3500
CLIENT_ORIGIN=http://localhost:3000
MCP_ENDPOINT=http://localhost:4000/mcp
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
```

## Usage

1. Build and start the MCP hub server:

   ```sh
   npm run start:hub
   ```

2. Start the front-end proxy server:

   ```sh
   npm run start:server
   ```

3. Open your browser at [http://localhost:3000](http://localhost:3000) to access the chat UI.

4. The hub JSON-RPC endpoint is available at `http://localhost:4000/mcp`.

## Directory Structure

```
├── LICENSE
├── package.json            # root package config and scripts
├── README.md
├── hub/                    # MCP hub server
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/ (TypeScript sources output to dist/)
│   ├── installToolsFeature.ts
│   ├── bridgeBuilder.ts
│   ├── bridgeHttp.ts
│   ├── bridgeStdio.ts
│   └── hub.ts
├── server/                 # proxy and front-end assets
│   ├── index.js
│   ├── extractContent.js
│   └── public/
│       ├── index.html
│       ├── css/
│       │   └── styles.css
│       └── js/
│           └── chat.js
└── hub/bridges/            # sample tool definitions
    └── hub.yaml
```

## Scripts

All scripts are defined in the root `package.json`:

- `npm run build` : Compile TypeScript in `hub` and copy bridge files
- `npm run copy:bridges`: Copy bridge YAML definitions to `hub/dist`
- `npm run start:hub` : Build then run the MCP hub server
- `npm run start:server`: Run the Express static server with chat UI

## License

- This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.

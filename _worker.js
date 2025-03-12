/**
 * Cloudflare Worker that forwards requests based on path instead of subdomain
 * Example: doh.example.com/google/query-dns → dns.google/dns-query
 * Supports configuration via Cloudflare Worker variables
 */

// Default configuration for path mappings
const DEFAULT_PATH_MAPPINGS = {
  "/google": {
    targetDomain: "dns.google",
    pathMapping: {
      "/query-dns": "/dns-query",
    },
  },
  "/cloudflare": {
    targetDomain: "one.one.one.one",
    pathMapping: {
      "/query-dns": "/dns-query",
    },
  },
  // Add more path mappings as needed
};

/**
 * Get path mappings from Cloudflare Worker env or use defaults
 * @param {Object} env - Environment variables from Cloudflare Worker
 * @returns {Object} Path mappings configuration
 */
function getPathMappings(env) {
  try {
    // Check if DOMAIN_MAPPINGS is defined in the env object
    if (env && env.DOMAIN_MAPPINGS) {
      // If it's a string, try to parse it as JSON
      if (typeof env.DOMAIN_MAPPINGS === "string") {
        return JSON.parse(env.DOMAIN_MAPPINGS);
      }
      // If it's already an object, use it directly
      return env.DOMAIN_MAPPINGS;
    }
  } catch (error) {
    console.error("Error accessing DOMAIN_MAPPINGS variable:", error);
  }

  // Fall back to default mappings if the variable is not set
  return DEFAULT_PATH_MAPPINGS;
}

/**
 * Serve homepage HTML
 * @returns {Response} The homepage response
 */
async function serveHomepage() {
  // Try to fetch the homepage from assets
  try {
    // This will look for index.html in your Worker's assets (when using Cloudflare Pages)
    return await fetch(new Request("index.html", { method: "GET" }));
  } catch (error) {
    // If the asset is not found or there's an error, return a simple message
    return new Response(
      `<html>
        <head>
          <title>DoH 转发代理</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body>
          <h1>DoH 转发代理服务</h1>
          <p>这是一个 DNS over HTTPS 转发代理服务。请查看 GitHub 仓库了解用法。</p>
          <a href="https://github.com/jqknono/cloudflare-doh">GitHub 仓库</a>
        </body>
      </html>`,
      {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  }
}

/**
 * Handle the incoming request
 * @param {Request} request - The incoming request
 * @param {Object} env - Environment variables from Cloudflare Worker
 * @returns {Response} The response to return
 */
async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const queryString = url.search; // Preserves the query string with the '?'

  // If the path is explicitly '/index.html' or '/', serve the homepage
  if (path === "/index.html" || path === "/") {
    return serveHomepage();
  }

  // Get the path mappings from env or defaults
  const pathMappings = getPathMappings(env);

  // Find the matching path prefix
  const pathPrefix = Object.keys(pathMappings).find(prefix => 
    path.startsWith(prefix)
  );

  if (pathPrefix) {
    const mapping = pathMappings[pathPrefix];
    const targetDomain = mapping.targetDomain;
    
    // Remove the prefix from the path
    const remainingPath = path.substring(pathPrefix.length);
    
    // Check if we have a specific path mapping for the remaining path
    let targetPath = remainingPath;
    for (const [sourcePath, destPath] of Object.entries(mapping.pathMapping)) {
      if (remainingPath.startsWith(sourcePath)) {
        targetPath = remainingPath.replace(sourcePath, destPath);
        break;
      }
    }
    
    // Construct the new URL with the preserved query string
    const newUrl = `https://${targetDomain}${targetPath}${queryString}`;
    
    // Clone the original request
    const newRequest = new Request(newUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "follow",
    });
    
    // Forward the request to the target domain
    return fetch(newRequest);
  }

  // If no mapping is found, serve the homepage instead of 404
  return serveHomepage();
}

// Export the worker
export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  },
};

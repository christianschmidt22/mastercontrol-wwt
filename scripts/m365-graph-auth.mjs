import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { PublicClientApplication } from "@azure/msal-node";
import { Dpapi } from "@primno/dpapi";

const GRAPH_POWERSHELL_CLIENT_ID = "14d82eec-204b-4c2f-b7e8-296a70dab67e";
const DEFAULT_TENANT_ID = "organizations";
const CACHE_DIR = ".secrets";
const CACHE_FILE = "m365-msal-cache.dpapi";
const SESSION_FILE = "m365-msal-session.json";
const DPAPI_SCOPE = "CurrentUser";
const EDGE_PATHS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

export const DEFAULT_GRAPH_SCOPES = [
  "User.Read",
  "Mail.Read",
  "Mail.ReadWrite",
  "Mail.Send",
  "Calendars.ReadWrite",
  "offline_access",
];

export function graphAuthConfigFromEnv() {
  const clientId = process.env.M365_CLIENT_ID ?? GRAPH_POWERSHELL_CLIENT_ID;
  const tenantId = process.env.M365_TENANT_ID ?? DEFAULT_TENANT_ID;
  const scopes = process.env.M365_GRAPH_SCOPES
    ? process.env.M365_GRAPH_SCOPES.split(/[,\s]+/).filter(Boolean)
    : DEFAULT_GRAPH_SCOPES;

  return {
    clientId,
    tenantId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    scopes,
    cachePath: path.resolve(process.env.M365_TOKEN_CACHE_PATH ?? path.join(CACHE_DIR, CACHE_FILE)),
    sessionPath: path.resolve(
      process.env.M365_TOKEN_SESSION_PATH ?? path.join(CACHE_DIR, SESSION_FILE)
    ),
  };
}

function encryptCache(cacheText) {
  if (process.platform !== "win32") {
    throw new Error("Encrypted MSAL cache currently requires Windows DPAPI");
  }
  const encrypted = Dpapi.protectData(Buffer.from(cacheText, "utf8"), null, DPAPI_SCOPE);
  return Buffer.from(encrypted).toString("base64");
}

function decryptCache(cacheText) {
  if (process.platform !== "win32") {
    throw new Error("Encrypted MSAL cache currently requires Windows DPAPI");
  }
  const encrypted = Buffer.from(cacheText, "base64");
  const decrypted = Dpapi.unprotectData(encrypted, null, DPAPI_SCOPE);
  return Buffer.from(decrypted).toString("utf8");
}

async function ensureParent(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function readEncryptedCache(cachePath) {
  if (!existsSync(cachePath)) {
    return "";
  }
  const encrypted = await readFile(cachePath, "utf8");
  return decryptCache(encrypted);
}

async function writeEncryptedCache(cachePath, cacheText) {
  await ensureParent(cachePath);
  await writeFile(cachePath, encryptCache(cacheText), "utf8");
}

function createCachePlugin(cachePath) {
  return {
    beforeCacheAccess: async (cacheContext) => {
      cacheContext.tokenCache.deserialize(await readEncryptedCache(cachePath));
    },
    afterCacheAccess: async (cacheContext) => {
      if (cacheContext.cacheHasChanged) {
        await writeEncryptedCache(cachePath, cacheContext.tokenCache.serialize());
      }
    },
  };
}

export function createPublicClient(config = graphAuthConfigFromEnv()) {
  return new PublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: config.authority,
    },
    cache: {
      cachePlugin: createCachePlugin(config.cachePath),
    },
    system: {
      loggerOptions: {
        piiLoggingEnabled: false,
      },
    },
  });
}

export async function writeSession(config, authResult) {
  const account = authResult.account;
  const session = {
    createdAt: new Date().toISOString(),
    clientId: config.clientId,
    tenantId: config.tenantId,
    authority: config.authority,
    scopes: config.scopes,
    account: account
      ? {
          homeAccountId: account.homeAccountId,
          username: account.username,
          name: account.name,
          tenantId: account.tenantId,
          environment: account.environment,
        }
      : null,
    accessTokenExpiresOn: authResult.expiresOn?.toISOString() ?? null,
    cachePath: config.cachePath,
  };

  await ensureParent(config.sessionPath);
  await writeFile(config.sessionPath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
  return session;
}

async function readSession(sessionPath) {
  if (!existsSync(sessionPath)) {
    return null;
  }
  return JSON.parse(await readFile(sessionPath, "utf8"));
}

async function chooseAccount(client, config) {
  const accounts = await client.getTokenCache().getAllAccounts();
  if (accounts.length === 0) {
    return null;
  }

  const session = await readSession(config.sessionPath);
  const rememberedId = session?.account?.homeAccountId;
  if (rememberedId) {
    const remembered = accounts.find((account) => account.homeAccountId === rememberedId);
    if (remembered) {
      return remembered;
    }
  }

  return accounts[0];
}

export async function loginWithDeviceCode(options = {}) {
  const config = graphAuthConfigFromEnv();
  const client = createPublicClient(config);

  const result = await client.acquireTokenByDeviceCode({
    scopes: options.scopes ?? config.scopes,
    deviceCodeCallback: (response) => {
      if (response.message) {
        console.log(response.message);
        return;
      }

      console.log(
        `To sign in, use a browser to open ${response.verificationUri} and enter code ${response.userCode}.`
      );
    },
  });

  const session = await writeSession(config, result);
  return { config, result, session };
}

async function openInEdge(url) {
  const explicitBrowser = process.env.M365_BROWSER_PATH;
  const browserPath = explicitBrowser ?? EDGE_PATHS.find((candidate) => existsSync(candidate));

  if (browserPath) {
    const child = spawn(browserPath, [url], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    child.unref();
    return;
  }

  const child = spawn("cmd.exe", ["/c", "start", "", url], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

export async function loginWithBrowser(options = {}) {
  const config = graphAuthConfigFromEnv();
  const client = createPublicClient(config);

  const result = await client.acquireTokenInteractive({
    scopes: options.scopes ?? config.scopes,
    openBrowser: async (url) => {
      console.log("Opening Microsoft sign-in in Edge.");
      console.log(url);
      await openInEdge(url);
    },
    successTemplate:
      "<html><body><h1>MasterControl M365 login complete</h1><p>You can close this tab.</p></body></html>",
    errorTemplate:
      "<html><body><h1>MasterControl M365 login failed</h1><p>Return to Codex for details.</p></body></html>",
  });

  const session = await writeSession(config, result);
  return { config, result, session };
}

export async function acquireGraphToken(options = {}) {
  const config = graphAuthConfigFromEnv();
  const client = createPublicClient(config);
  const scopes = options.scopes ?? config.scopes;
  const account = await chooseAccount(client, config);

  if (!account) {
    throw new Error("No cached M365 account. Run: node scripts/m365-graph-browser-login.mjs");
  }

  try {
    const result = await client.acquireTokenSilent({ account, scopes });
    await writeSession(config, result);
    return {
      accessToken: result.accessToken,
      expiresOn: result.expiresOn,
      account: result.account,
      fromCache: true,
      config,
    };
  } catch (error) {
    error.message = `${error.message}\nSilent token refresh failed. Run: node scripts/m365-graph-browser-login.mjs`;
    throw error;
  }
}

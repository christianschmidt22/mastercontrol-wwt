#!/usr/bin/env node

import { loginWithDeviceCode } from "./m365-graph-auth.mjs";

function printIntro() {
  console.log("Starting Microsoft Graph device-code login for MasterControl.");
  console.log("Requested delegated scopes come from M365_GRAPH_SCOPES or the script defaults.");
  console.log("The MSAL token cache will be stored encrypted with Windows DPAPI under .secrets/.");
  console.log("");
}

async function main() {
  printIntro();
  const { config, result, session } = await loginWithDeviceCode();
  console.log("");
  console.log("M365 device-code login complete.");
  console.log(`Account: ${session.account?.username ?? result.account?.username ?? "unknown"}`);
  console.log(`Client ID: ${config.clientId}`);
  console.log(`Tenant: ${config.tenantId}`);
  console.log(`Access token expires: ${result.expiresOn?.toISOString() ?? "unknown"}`);
  console.log(`Encrypted cache: ${config.cachePath}`);
  console.log(`Session metadata: ${config.sessionPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

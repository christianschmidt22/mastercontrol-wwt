#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { acquireGraphToken } from "./m365-graph-auth.mjs";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const DEFAULT_TIME_ZONE = "Central Standard Time";
const DEFAULT_IANA_TIME_ZONE = "America/Chicago";

function parseArgs(argv) {
  const args = {
    outDir: "reports/m365-graph",
    date: localDate(new Date(), DEFAULT_IANA_TIME_ZONE),
    includeMessageBody: process.env.M365_RECORD_BODY === "1",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      args.outDir = requireValue(argv, (index += 1), "--out");
    } else if (arg === "--date") {
      args.date = requireValue(argv, (index += 1), "--date");
    } else if (arg === "--include-message-body") {
      args.includeMessageBody = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error("--date must use YYYY-MM-DD");
  }

  return args;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function printHelp() {
  console.log(`
Microsoft Graph smoke test for delegated M365 access tokens.

Usage:
  node scripts/m365-graph-browser-login.mjs
  node scripts/m365-graph-smoke-test.mjs --date 2026-05-04

Options:
  --date YYYY-MM-DD            Calendar day to read. Defaults to today in America/Chicago.
  --out DIR                    Report directory. Defaults to reports/m365-graph.
  --include-message-body       Store a truncated message body excerpt in the JSON report.

Environment:
  GRAPH_ACCESS_TOKEN           Optional one-off token. If omitted, the MSAL device-code cache is used.
  M365_RECORD_BODY=1           Same as --include-message-body.
`);
}

function decodeJwtPayload(token) {
  const [, payload] = token.split(".");
  if (!payload) {
    throw new Error("GRAPH_ACCESS_TOKEN does not look like a JWT");
  }
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

function unixToIso(value) {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : null;
}

function localDate(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function nextDate(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

function addDays(dateText, days) {
  const [year, month, day] = dateText.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}

function stripHtml(html) {
  return String(html ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, maxLength = 1000) {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function pickHeaders(headers) {
  return {
    requestId: headers.get("request-id") ?? headers.get("client-request-id"),
    date: headers.get("date"),
  };
}

function graphError(step, response, bodyText, parsedBody) {
  const detail = parsedBody?.error ?? parsedBody ?? bodyText;
  const error = new Error(`${step} failed with HTTP ${response.status}`);
  error.status = response.status;
  error.statusText = response.statusText;
  error.headers = pickHeaders(response.headers);
  error.detail = detail;
  return error;
}

function summarizeError(error) {
  return {
    message: error.message,
    status: error.status ?? null,
    statusText: error.statusText ?? null,
    requestId: error.headers?.requestId ?? null,
    date: error.headers?.date ?? null,
    code: error.detail?.code ?? error.detail?.error?.code ?? null,
    graphMessage: error.detail?.message ?? error.detail?.error?.message ?? null,
  };
}

async function graphRequest(token, step, endpoint, init = {}) {
  const url = endpoint.startsWith("https://")
    ? new URL(endpoint)
    : new URL(`${GRAPH_ROOT}${endpoint}`);

  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");

  let body;
  if (init.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.body);
  }

  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers,
    body,
  });

  const bodyText = await response.text();
  let parsedBody = null;
  if (bodyText) {
    try {
      parsedBody = JSON.parse(bodyText);
    } catch {
      parsedBody = bodyText;
    }
  }

  if (!response.ok) {
    throw graphError(step, response, bodyText, parsedBody);
  }

  return {
    status: response.status,
    headers: pickHeaders(response.headers),
    body: parsedBody,
  };
}

async function runStep(report, name, task) {
  const startedAt = new Date().toISOString();
  try {
    const result = await task();
    report.steps[name] = {
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      ...result,
    };
    console.log(`ok: ${name}`);
    return result;
  } catch (error) {
    report.steps[name] = {
      ok: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      error: summarizeError(error),
    };
    console.log(`failed: ${name} (${error.message})`);
    return null;
  }
}

function messageSummary(message, includeBody) {
  const bodyText = stripHtml(message.body?.content);
  return {
    id: message.id,
    subject: message.subject,
    from: message.from?.emailAddress ?? null,
    toRecipients: message.toRecipients?.map((recipient) => recipient.emailAddress) ?? [],
    ccRecipients: message.ccRecipients?.map((recipient) => recipient.emailAddress) ?? [],
    receivedDateTime: message.receivedDateTime,
    sentDateTime: message.sentDateTime,
    isRead: message.isRead,
    webLink: message.webLink,
    bodyPreview: truncate(message.bodyPreview, 1000),
    bodyContentType: message.body?.contentType ?? null,
    bodyTextExcerpt: includeBody ? truncate(bodyText, 2000) : null,
  };
}

function eventSummary(event) {
  if (!event) {
    return null;
  }
  return {
    id: event.id,
    subject: event.subject,
    organizer: event.organizer?.emailAddress ?? null,
    start: event.start,
    end: event.end,
    location: event.location?.displayName ?? null,
    isOnlineMeeting: event.isOnlineMeeting ?? null,
    showAs: event.showAs ?? null,
    webLink: event.webLink ?? null,
    bodyPreview: truncate(stripHtml(event.body?.content), 1000),
  };
}

function markdownReport(report) {
  const lines = [
    `# M365 Graph smoke test ${report.runId}`,
    "",
    `Created: ${report.createdAt}`,
    `Account: ${report.account.userPrincipalName ?? report.account.mail ?? "unknown"}`,
    `Calendar day read: ${report.config.calendarDate}`,
    "",
    "## Summary",
    "",
    ...Object.entries(report.steps).map(([name, step]) => {
      if (step.ok) {
        return `- ${name}: ok`;
      }
      const code = step.error.code ? `, ${step.error.code}` : "";
      return `- ${name}: failed (${step.error.status ?? "no status"}${code})`;
    }),
    "",
    "## Notes",
    "",
    "- The access token is not stored in this report.",
    "- Message body capture is disabled unless M365_RECORD_BODY=1 or --include-message-body is used.",
    "- The JSON file beside this markdown contains IDs, request IDs, and truncated previews for audit/debugging.",
    "",
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tokenResult = process.env.GRAPH_ACCESS_TOKEN
    ? { accessToken: process.env.GRAPH_ACCESS_TOKEN, source: "GRAPH_ACCESS_TOKEN" }
    : { ...(await acquireGraphToken()), source: "msal-cache" };
  const token = tokenResult.accessToken;

  const claims = decodeJwtPayload(token);
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const report = {
    runId,
    createdAt: new Date().toISOString(),
    token: {
      rawTokenStored: false,
      audience: claims.aud ?? null,
      tenantId: claims.tid ?? null,
      appId: claims.appid ?? null,
      appDisplayName: claims.app_displayname ?? null,
      userPrincipalName: claims.upn ?? claims.unique_name ?? null,
      source: tokenResult.source,
      issuedAt: unixToIso(claims.iat),
      notBefore: unixToIso(claims.nbf),
      expiresAt: unixToIso(claims.exp),
      scopes: typeof claims.scp === "string" ? claims.scp.split(" ") : [],
    },
    config: {
      calendarDate: args.date,
      timeZone: DEFAULT_TIME_ZONE,
      includeMessageBody: args.includeMessageBody,
      outputDirectory: path.resolve(args.outDir),
      authSource: tokenResult.source,
    },
    account: {},
    steps: {},
  };

  const me = await runStep(report, "read-profile", async () => {
    const response = await graphRequest(
      token,
      "read-profile",
      "/me?$select=id,displayName,mail,userPrincipalName"
    );
    const account = response.body ?? {};
    report.account = {
      id: account.id,
      displayName: account.displayName,
      mail: account.mail,
      userPrincipalName: account.userPrincipalName,
    };
    return {
      status: response.status,
      requestId: response.headers.requestId,
      account: report.account,
    };
  });

  const selfAddress =
    me?.account?.mail ??
    me?.account?.userPrincipalName ??
    report.token.userPrincipalName;

  const latestInbox = await runStep(report, "read-inbox-latest", async () => {
    const response = await graphRequest(
      token,
      "read-inbox-latest",
      "/me/mailFolders/inbox/messages?$top=1&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,isRead,bodyPreview,webLink"
    );
    const messages = response.body?.value ?? [];
    return {
      status: response.status,
      requestId: response.headers.requestId,
      count: messages.length,
      latest: messages[0] ? messageSummary(messages[0], false) : null,
    };
  });

  const latestMessageId = latestInbox?.latest?.id;
  if (latestMessageId) {
    await runStep(report, "read-message-detail", async () => {
      const response = await graphRequest(
        token,
        "read-message-detail",
        `/me/messages/${encodeURIComponent(latestMessageId)}?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,body,bodyPreview,webLink`
      );
      return {
        status: response.status,
        requestId: response.headers.requestId,
        message: messageSummary(response.body, args.includeMessageBody),
      };
    });
  } else {
    report.steps["read-message-detail"] = {
      ok: false,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      error: { message: "Skipped because the inbox query returned no messages" },
    };
  }

  if (selfAddress) {
    await runStep(report, "send-self-email", async () => {
      const response = await graphRequest(token, "send-self-email", "/me/sendMail", {
        method: "POST",
        body: {
          message: {
            subject: `MasterControl Graph smoke test ${runId}`,
            body: {
              contentType: "Text",
              content: `This is a Microsoft Graph API smoke-test message generated by scripts/m365-graph-smoke-test.mjs at ${report.createdAt}.`,
            },
            toRecipients: [
              {
                emailAddress: {
                  address: selfAddress,
                },
              },
            ],
          },
          saveToSentItems: true,
        },
      });
      return {
        status: response.status,
        requestId: response.headers.requestId,
        to: selfAddress,
        subject: `MasterControl Graph smoke test ${runId}`,
      };
    });
  } else {
    report.steps["send-self-email"] = {
      ok: false,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      error: { message: "Skipped because no self email address was available" },
    };
  }

  const dayStart = `${args.date}T00:00:00`;
  const dayEnd = `${nextDate(args.date)}T00:00:00`;
  const calendarView = await runStep(report, "read-calendar-day", async () => {
    const endpoint =
      `/me/calendarView?startDateTime=${encodeURIComponent(dayStart)}` +
      `&endDateTime=${encodeURIComponent(dayEnd)}` +
      "&$orderby=start/dateTime" +
      "&$top=50" +
      "&$select=id,subject,organizer,start,end,location,isOnlineMeeting,showAs,webLink";
    const response = await graphRequest(token, "read-calendar-day", endpoint, {
      headers: {
        Prefer: `outlook.timezone="${DEFAULT_TIME_ZONE}"`,
      },
    });
    const events = response.body?.value ?? [];
    return {
      status: response.status,
      requestId: response.headers.requestId,
      count: events.length,
      events: events.map(eventSummary),
    };
  });

  const detailEventId = calendarView?.events?.[0]?.id;
  if (detailEventId) {
    await runStep(report, "read-calendar-entry-detail", async () => {
      const response = await graphRequest(
        token,
        "read-calendar-entry-detail",
        `/me/events/${encodeURIComponent(detailEventId)}?$select=id,subject,organizer,start,end,location,isOnlineMeeting,showAs,webLink,body`,
        {
          headers: {
            Prefer: `outlook.timezone="${DEFAULT_TIME_ZONE}"`,
          },
        }
      );
      return {
        status: response.status,
        requestId: response.headers.requestId,
        event: eventSummary(response.body),
      };
    });
  } else {
    report.steps["read-calendar-entry-detail"] = {
      ok: false,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      error: { message: "Skipped because the calendar day query returned no events" },
    };
  }

  const sampleDate = addDays(args.date, 1);
  await runStep(report, "create-sample-calendar-entry", async () => {
    const subject = `MasterControl Graph smoke test ${runId}`;
    const response = await graphRequest(token, "create-sample-calendar-entry", "/me/events", {
      method: "POST",
      body: {
        subject,
        body: {
          contentType: "Text",
          content: "Created by the MasterControl Microsoft Graph smoke-test script. Safe to delete.",
        },
        start: {
          dateTime: `${sampleDate}T07:30:00`,
          timeZone: DEFAULT_TIME_ZONE,
        },
        end: {
          dateTime: `${sampleDate}T07:45:00`,
          timeZone: DEFAULT_TIME_ZONE,
        },
        location: {
          displayName: "MasterControl local API test",
        },
        showAs: "free",
        isReminderOn: false,
        transactionId: `mastercontrol-${runId}`,
      },
      headers: {
        Prefer: `outlook.timezone="${DEFAULT_TIME_ZONE}"`,
      },
    });
    return {
      status: response.status,
      requestId: response.headers.requestId,
      event: eventSummary(response.body),
    };
  });

  await mkdir(args.outDir, { recursive: true });
  const jsonPath = path.join(args.outDir, `${runId}.json`);
  const mdPath = path.join(args.outDir, `${runId}.md`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, markdownReport(report), "utf8");

  console.log(`json: ${path.resolve(jsonPath)}`);
  console.log(`markdown: ${path.resolve(mdPath)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

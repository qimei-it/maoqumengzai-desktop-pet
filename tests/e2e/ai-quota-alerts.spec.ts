import { _electron as electron, expect, test } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { defaultSettings } from "../../src/shared/settings";

let application: ElectronApplication;
let pet: Page;
let directory: string;
let server: Server;
let servedTotal = "3.00";
const resetAt = Math.floor(Date.now() / 1000) + 3_600;

async function findPet(app: ElectronApplication): Promise<Page> {
  await expect
    .poll(async () => {
      for (const page of app.windows()) {
        if ((await page.title()).includes("交互标记")) return true;
      }
      return false;
    })
    .toBe(true);
  return (
    await Promise.all(
      app.windows().map(async (page) => ({
        page,
        title: await page.title(),
      })),
    )
  ).find((item) => item.title.includes("交互标记"))!.page;
}

async function snapshot() {
  const result = await pet.evaluate(() => window.mqmz!.snapshot());
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

async function alertCount(prefix: string): Promise<number> {
  const state = await snapshot();
  return state.events.filter((event) =>
    event.message.startsWith(prefix),
  ).length;
}

test.beforeAll(async () => {
  server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/openai") {
      response.end(
        JSON.stringify({
          plan_type: "plus",
          rate_limit: {
            primary_window: {
              used_percent: 95,
              limit_window_seconds: 18_000,
              reset_at: resetAt,
            },
            secondary_window: {
              used_percent: 50,
              limit_window_seconds: 604_800,
              reset_at: resetAt + 86_400,
            },
          },
        }),
      );
      return;
    }
    if (request.url === "/deepseek") {
      response.end(
        JSON.stringify({
          is_available: true,
          balance_infos: [
            {
              currency: "CNY",
              total_balance: servedTotal,
              granted_balance: "0",
              topped_up_balance: servedTotal,
            },
          ],
        }),
      );
      return;
    }
    response.statusCode = 404;
    response.end("{}");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("fixture server did not start");
  const base = `http://127.0.0.1:${address.port}`;

  directory = await mkdtemp(join(tmpdir(), "mqmz-ai-quota-alerts-"));
  const data = join(directory, "data");
  const shots = join(directory, "shots");
  const codexHome = join(directory, "codex-home");
  await mkdir(data, { recursive: true });
  await mkdir(shots, { recursive: true });
  await mkdir(codexHome, { recursive: true });
  await writeFile(
    join(codexHome, "auth.json"),
    JSON.stringify({ tokens: { access_token: "fixture-token" } }),
    "utf8",
  );
  await writeFile(
    join(data, "mqmz.settings.json"),
    JSON.stringify({
      ...defaultSettings,
      aiQuotaOpenAIPath: "",
      aiQuotaRefreshMinutes: 60,
    }),
    "utf8",
  );
  await writeFile(
    join(data, "mqmz.ai.json"),
    JSON.stringify({ version: 1, key: "plain:fixture-deepseek-key" }),
    "utf8",
  );
  await writeFile(
    join(data, "mqmz.focus.json"),
    JSON.stringify({
      version: 5,
      phase: "focus",
      running: false,
      endsAt: null,
      remaining: 1500,
      completed: 0,
      focusMinutes: 25,
      shortMinutes: 5,
      longMinutes: 15,
      focusSeconds: 0,
      shortSeconds: 0,
      longSeconds: 0,
      water: false,
      waterInterval: 60,
      waterStart: 9,
      waterEnd: 22,
      waterNextAt: null,
      waterGoal: 8,
      breakSitting: false,
      breakSittingInterval: 45,
      breakSittingNextAt: null,
      breakEyes: false,
      breakEyesInterval: 20,
      breakEyesNextAt: null,
      breakDnd: false,
      breakDndStart: 22,
      breakDndEnd: 8,
      todos: [],
      todoLists: [],
      todoGroups: [],
      todoTags: [],
      sessions: [],
      waterLog: [],
    }),
    "utf8",
  );

  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  environment.MQMZ_DATA_DIR = data;
  environment.MQMZ_SCREENSHOT_DIR = shots;
  environment.CODEX_HOME = codexHome;
  environment.MQMZ_QUOTA_OPENAI_URL = `${base}/openai`;
  environment.MQMZ_QUOTA_DEEPSEEK_URL = `${base}/deepseek`;
  environment.MQMZ_QUOTA_REFRESH_MS = "60000";
  delete environment.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({
    args: [resolve(".")],
    env: environment,
  });
  pet = await findPet(application);
});

test.afterAll(async () => {
  await application?.close();
  await new Promise<void>((done) => server.close(() => done()));
  await rm(directory, { recursive: true, force: true });
});

test("low quota and balance alert once, then a critical balance alerts again", async () => {
  await expect
    .poll(async () => {
      const state = await snapshot();
      return (
        state.aiQuota.openai.status === "ready" &&
        state.aiQuota.deepseek.status === "ready"
      );
    })
    .toBe(true);
  await expect.poll(() => alertCount("额度提醒：主人，")).toBe(1);
  await expect.poll(() => alertCount("余额提醒：主人，")).toBe(1);

  const first = await snapshot();
  const openaiAlert = first.events.find((event) =>
    event.message.startsWith("额度提醒：主人，"),
  )!;
  expect(openaiAlert.message).not.toContain("{");
  const balanceAlert = first.events.find((event) =>
    event.message.startsWith("余额提醒：主人，"),
  )!;
  expect(balanceAlert.message).not.toContain("{");

  servedTotal = "4.00";
  await application.evaluate(({ powerMonitor }) => {
    powerMonitor.emit("resume");
  });
  await expect
    .poll(async () => (await snapshot()).aiQuota.deepseek.balance?.total ?? 0)
    .toBe(4);
  expect(await alertCount("余额提醒：主人，")).toBe(1);

  servedTotal = "0.50";
  await application.evaluate(({ powerMonitor }) => {
    powerMonitor.emit("resume");
  });
  await expect
    .poll(async () => (await snapshot()).aiQuota.deepseek.balance?.total ?? 0)
    .toBe(0.5);
  await expect.poll(() => alertCount("余额提醒：主人，")).toBe(2);
  const critical = (await snapshot()).events.find((event) =>
    event.message.startsWith("余额提醒：主人，"),
  )!;
  expect(critical.message).not.toContain("{");
});

import { _electron as electron, expect, test } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { defaultSettings } from "../../src/shared/settings";

let application: ElectronApplication | undefined;
let server: Server;
let directory: string;
let data: string;
let pet: Page;

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

test.beforeAll(async () => {
  server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/openai") {
      response.end(
        JSON.stringify({
          plan_type: "plus",
          rate_limit: {
            primary_window: {
              used_percent: 25,
              limit_window_seconds: 18_000,
              reset_at: 1_800_000_000,
            },
            secondary_window: {
              used_percent: 60,
              limit_window_seconds: 604_800,
              reset_at: 1_800_000_000,
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
              total_balance: "41.36",
              granted_balance: "0",
              topped_up_balance: "41.36",
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

  directory = await mkdtemp(join(tmpdir(), "mqmz-ai-quota-cache-e2e-"));
  data = join(directory, "data");
  const shots = join(directory, "shots");
  const codexHome = join(directory, "codex-empty");
  await mkdir(data, { recursive: true });
  await mkdir(shots, { recursive: true });
  await mkdir(codexHome, { recursive: true });
  const authPath = join(data, "codex-auth.json");
  await writeFile(
    authPath,
    JSON.stringify({
      tokens: {
        access_token: "fixture-access-token",
        account_id: "fixture-account",
      },
    }),
    "utf8",
  );
  await writeFile(
    join(data, "mqmz.settings.json"),
    JSON.stringify({
      ...defaultSettings,
      aiQuotaOpenAIPath: authPath,
      aiQuotaRefreshMinutes: 60,
    }),
    "utf8",
  );
  await writeFile(
    join(data, "mqmz.ai.json"),
    JSON.stringify({ version: 1, key: "plain:fixture-deepseek-key" }),
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
  delete environment.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({
    args: [resolve(".")],
    env: environment,
  });
  pet = await findPet(application);
  await expect
    .poll(async () => {
      const state = await snapshot();
      return `${state.aiQuota.openai.windows.length}:${state.aiQuota.deepseek.balance?.total ?? ""}`;
    })
    .toBe("2:41.36");
  await expect
    .poll(async () => {
      try {
        const cached = JSON.parse(
          await readFile(join(data, "mqmz.ai-quota.json"), "utf8"),
        ) as { openai?: { windows?: unknown[] } };
        return cached.openai?.windows?.length ?? 0;
      } catch {
        return 0;
      }
    })
    .toBe(2);
  await application.close();
  application = undefined;
  await new Promise<void>((done) => server.close(() => done()));
});

test("restores the last successful values after restart while offline", async () => {
  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  environment.MQMZ_DATA_DIR = data;
  environment.MQMZ_SCREENSHOT_DIR = join(directory, "shots");
  environment.CODEX_HOME = join(directory, "codex-empty");
  environment.MQMZ_QUOTA_OPENAI_URL = "http://127.0.0.1:1/openai";
  environment.MQMZ_QUOTA_DEEPSEEK_URL = "http://127.0.0.1:1/deepseek";
  delete environment.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({
    args: [resolve(".")],
    env: environment,
  });
  pet = await findPet(application);
  await expect
    .poll(async () => {
      const state = await snapshot();
      return `${state.aiQuota.openai.status}:${state.aiQuota.openai.windows.length}:${state.aiQuota.deepseek.status}:${state.aiQuota.deepseek.balance?.total ?? ""}`;
    })
    .toBe("stale:2:stale:41.36");
  const state = await snapshot();
  expect(state.aiQuota.visible).toBe(true);
  await expect
    .poll(async () => {
      for (const page of application!.windows()) {
        if ((await page.title()).includes("AI 额度")) return true;
      }
      return false;
    })
    .toBe(true);
  const page = (
    await Promise.all(
      application.windows().map(async (page) => ({
        page,
        title: await page.title(),
      })),
    )
  ).find((item) => item.title.includes("AI 额度"))!.page;
  await expect(page.locator(".quota-surface")).toContainText("1w 40%");
  await expect(page.locator(".quota-surface")).toContainText("¥41.36");
});

test.afterAll(async () => {
  await application?.close();
  await rm(directory, { recursive: true, force: true });
});

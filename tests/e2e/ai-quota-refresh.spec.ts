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
let deepseekCalls = 0;

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
    if (request.url === "/deepseek") {
      deepseekCalls += 1;
      response.end(
        JSON.stringify({
          is_available: true,
          balance_infos: [
            {
              currency: "CNY",
              total_balance: deepseekCalls === 1 ? "30.00" : "29.00",
              granted_balance: "0",
              topped_up_balance: deepseekCalls === 1 ? "30.00" : "29.00",
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

  directory = await mkdtemp(join(tmpdir(), "mqmz-ai-quota-refresh-"));
  const data = join(directory, "data");
  const shots = join(directory, "shots");
  const codexHome = join(directory, "codex-empty");
  await mkdir(data, { recursive: true });
  await mkdir(shots, { recursive: true });
  await mkdir(codexHome, { recursive: true });
  await writeFile(
    join(data, "mqmz.settings.json"),
    JSON.stringify({
      ...defaultSettings,
      aiQuotaOpenAIPath: "",
      aiQuotaRefreshMinutes: 5,
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
  environment.MQMZ_QUOTA_DEEPSEEK_URL = `${base}/deepseek`;
  environment.MQMZ_QUOTA_REFRESH_MS = "5000";
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

test("refreshes the balance on the scheduled interval", async () => {
  await expect
    .poll(async () => {
      const state = await snapshot();
      return state.aiQuota.deepseek.balance?.total ?? 0;
    })
    .toBe(30);
  const firstUpdatedAt = (await snapshot()).aiQuota.deepseek.updatedAt;
  expect(typeof firstUpdatedAt).toBe("number");

  await expect
    .poll(() => deepseekCalls, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(2);
  await expect
    .poll(
      async () => (await snapshot()).aiQuota.deepseek.balance?.total ?? 0,
      { timeout: 10_000 },
    )
    .toBe(29);

  const secondUpdatedAt = (await snapshot()).aiQuota.deepseek.updatedAt ?? 0;
  expect(secondUpdatedAt).toBeGreaterThan(firstUpdatedAt ?? 0);

  await expect
    .poll(async () => {
      for (const page of application.windows()) {
        if ((await page.title()).includes("AI 额度")) return page;
      }
      return undefined;
    })
    .toBeTruthy();
  const quota = (
    await Promise.all(
      application.windows().map(async (page) => ({
        page,
        title: await page.title(),
      })),
    )
  ).find((item) => item.title.includes("AI 额度"))!.page;
  await expect(quota.locator(".quota-deepseek")).toHaveAttribute(
    "title",
    /更新于 \d{2}:\d{2}:\d{2}/,
  );
});

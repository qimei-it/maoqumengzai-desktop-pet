import { _electron as electron, expect, test } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { defaultSettings } from "../../src/shared/settings";

let application: ElectronApplication;
let pet: Page;
let quota: Page | undefined;
let directory: string;
let server: Server;
let requests: string[] = [];

test.beforeAll(async () => {
  server = createServer((request, response) => {
    requests.push(request.url ?? "");
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/openai") {
      response.end(
        JSON.stringify({
          plan_type: "pro",
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
              total_balance: "28.60",
              granted_balance: "0",
              topped_up_balance: "28.60",
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

  directory = await mkdtemp(join(tmpdir(), "mqmz-ai-quota-"));
  const data = join(directory, "data");
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
  await expect
    .poll(async () => {
      for (const page of application.windows()) {
        if ((await page.title()).includes("交互标记")) return true;
      }
      return false;
    })
    .toBe(true);
  pet = (
    await Promise.all(
      application.windows().map(async (page) => ({
        page,
        title: await page.title(),
      })),
    )
  ).find((item) => item.title.includes("交互标记"))!.page;
});

test.afterAll(async () => {
  await application?.close();
  await new Promise<void>((done) => server.close(() => done()));
  await rm(directory, { recursive: true, force: true });
});

async function quotaPage(): Promise<Page | undefined> {
  for (const page of application.windows()) {
    if ((await page.title()).includes("AI 额度")) return page;
  }
  return undefined;
}

async function snapshot() {
  const result = await pet.evaluate(() => window.mqmz!.snapshot());
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

test("shows both providers, then shrinks and hides as configuration changes", async () => {
  await expect
    .poll(async () => {
      const state = await snapshot();
      return `${state.aiQuota.visible}:${state.aiQuota.openai.windows.length}:${state.aiQuota.deepseek.balance?.total ?? ""}`;
    })
    .toBe("true:2:28.6");
  await expect.poll(async () => Boolean(await quotaPage())).toBe(true);
  quota = await quotaPage();
  if (!quota) throw new Error("quota page missing");
    await expect(quota.locator(".quota-surface")).toContainText("5h 75%");
  await expect(quota.locator(".quota-surface")).toContainText("1w 40%");
  await expect(quota.locator(".quota-surface")).toContainText("¥28.60");
  const sides = await quota.evaluate(() => [
    document.querySelector(".quota-openai")!.getBoundingClientRect().width,
    document.querySelector(".quota-deepseek")!.getBoundingClientRect().width,
  ]);
  expect(Math.abs(sides[0] - sides[1])).toBeLessThanOrEqual(0.5);
  await expect(pet.locator(".marker-caption")).toHaveClass(/hidden/);
  const both = await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((item) =>
      item.getTitle().includes("AI 额度"),
    )!;
    return { visible: window.isVisible(), ...window.getBounds() };
  });
  expect(both.visible).toBe(true);
  expect(both.width).toBe(240);
  expect(both.height).toBe(60);
  expect(requests).toContain("/openai");
  expect(requests).toContain("/deepseek");

  await pet.evaluate(() => window.mqmz!.command({ type: "ai-clear" }));
  await expect
    .poll(async () => {
      const state = await snapshot();
      return `${state.aiQuota.visible}:${state.aiQuota.openai.configured}:${state.aiQuota.deepseek.configured}`;
    })
    .toBe("true:true:false");
  await expect
    .poll(async () => {
      const bounds = await application.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows().find((item) =>
          item.getTitle().includes("AI 额度"),
        )!;
        return window.getBounds();
      });
      return bounds.width;
    })
    .toBe(150);
  await expect(quota.locator(".quota-surface")).not.toContainText("DeepSeek");

  await pet.evaluate(() =>
    window.mqmz!.command({
      type: "settings-update",
      patch: { aiQuotaOpenAIPath: "" },
    }),
  );
  await expect
    .poll(async () => {
      const state = await snapshot();
      return state.aiQuota.visible;
    })
    .toBe(false);
  const hidden = await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((item) =>
      item.getTitle().includes("AI 额度"),
    );
    return window ? window.isVisible() : false;
  });
  expect(hidden).toBe(false);
  await expect(pet.locator(".marker-caption")).not.toHaveClass(/hidden/);
});

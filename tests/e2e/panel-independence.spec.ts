import { _electron as electron, expect, test } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { waitForAppWindows } from "./app-windows";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let application: ElectronApplication;
let pet: Page;
let directory: string;

function panelVisible(title: string) {
  return application.evaluate(({ BrowserWindow }, needle) => {
    const window = BrowserWindow.getAllWindows().find((item) =>
      item.getTitle().includes(needle),
    );
    return Boolean(window?.isVisible());
  }, title);
}

function command(type: string) {
  return pet.evaluate(
    (name) => window.mqmz!.command({ type: name } as never),
    type,
  );
}

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "mqmz-panel-stack-"));
  const data = join(directory, "data");
  const shots = join(directory, "shots");
  await mkdir(data, { recursive: true });
  await mkdir(shots, { recursive: true });
  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  environment.MQMZ_DATA_DIR = data;
  environment.MQMZ_SCREENSHOT_DIR = shots;
  delete environment.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({
    args: [resolve(".")],
    env: environment,
  });
  await waitForAppWindows(application);
  const windows = await Promise.all(
    application.windows().map(async (page) => ({
      page,
      title: await page.title(),
    })),
  );
  pet = windows.find((item) => item.title.includes("交互标记"))!.page;
});

test.afterAll(async () => {
  await application?.close();
  await rm(directory, { recursive: true, force: true });
});

test("opening a panel no longer closes the panels opened before it", async () => {
  await command("pomodoro-open");
  await command("water-open");
  await command("break-open");
  for (const title of ["番茄时钟", "喝水提醒", "休息提醒"]) {
    await expect.poll(() => panelVisible(title)).toBe(true);
  }

  await command("settings-open");
  for (const title of ["番茄时钟", "喝水提醒", "休息提醒", "设置"]) {
    await expect.poll(() => panelVisible(title)).toBe(true);
  }

  await command("water-close");
  await expect.poll(() => panelVisible("喝水提醒")).toBe(false);
  await expect.poll(() => panelVisible("番茄时钟")).toBe(true);
  await expect.poll(() => panelVisible("设置")).toBe(true);

  await command("break-close");
  await command("pomodoro-close");
  await command("settings-close");
});

test("the shelf stays open when another panel takes focus", async () => {
  await application.evaluate(({ app }) => app.focus({ steal: true }));
  await command("show-pocket");
  await expect.poll(() => panelVisible("文件置物架")).toBe(true);

  await command("settings-open");
  await expect.poll(() => panelVisible("设置")).toBe(true);
  // Older builds hid the shelf 180ms after it lost focus.
  await new Promise((resolve) => setTimeout(resolve, 500));
  await expect.poll(() => panelVisible("文件置物架")).toBe(true);

  await command("hide-pocket");
  await expect.poll(() => panelVisible("文件置物架")).toBe(false);
  await command("settings-close");
});

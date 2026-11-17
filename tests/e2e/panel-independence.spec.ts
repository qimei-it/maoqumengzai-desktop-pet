import { _electron as electron, expect, test } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { waitForAppWindows } from "./app-windows";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let application: ElectronApplication;
let pet: Page;
let settings: Page;
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
  settings = windows.find((item) => item.title.includes("设置"))!.page;
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

test("closing settings discards the pet wizard and resets to appearance", async () => {
  await command("settings-open");
  await expect.poll(() => panelVisible("设置")).toBe(true);
  // Settings is torn down on close, so always pick up the live page.
  settings = application
    .windows()
    .find((page) => !page.isClosed() && page.url().includes("view=settings"))!;
  await settings.evaluate(() =>
    window.mqmz!.command({ type: "settings-section", section: "profile" }),
  );
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.settingsSection : "";
    })
    .toBe("profile");
  await settings.evaluate(() =>
    window.mqmz!.command({ type: "pet-create-open" }),
  );
  const wizard = settings.getByRole("dialog", { name: "新建桌宠" });
  await expect(wizard).toBeVisible();

  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((window) => window.getTitle().includes("设置"))
      ?.close();
  });
  await expect.poll(() => panelVisible("设置")).toBe(false);
  await command("settings-open");
  await expect.poll(() => panelVisible("设置")).toBe(true);
  // The settings window is torn down on close, so the reopened one is a new page.
  settings = application
    .windows()
    .find((page) => !page.isClosed() && page.url().includes("view=settings"))!;

  await expect(
    settings.getByRole("dialog", { name: "新建桌宠" }),
  ).toHaveCount(0);
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.petCreate.open : true;
    })
    .toBe(false);
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.settingsSection : "";
    })
    .toBe("appearance");
  await expect(
    settings.getByRole("button", { name: "外观", exact: true }),
  ).toHaveAttribute("aria-current", "page");
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

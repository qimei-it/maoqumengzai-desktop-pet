import { _electron as electron, expect, test } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import sharp from "sharp";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { unzipSync } from "fflate";
import { promisify } from "node:util";
import {
  donutMetrics,
  hoverActions,
  midAngle,
  sliceActions,
  sliceCount,
  sliceLabels,
  type DropAction,
} from "../../src/shared/donut";

let application: ElectronApplication;
let lab: Page;
let pet: Page;
let pocket: Page;
let ask: Page;
let convert: Page;
let rename: Page;
let settings: Page;
let mail: Page;
let pomodoro: Page;
let water: Page;
let breakPanel: Page;
let profile: Page;
let clipboard: Page;
let focusBadge: Page;
let todo: Page;
let pill: Page;
let directory: string;
let launchEnvironment: Record<string, string>;
let startupVisibility: { title: string; visible: boolean }[];
const runtimeErrors: string[] = [];

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "mqmz-p0-e2e-"));
  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  environment.MQMZ_DATA_DIR = join(directory, "data");
  environment.MQMZ_SCREENSHOT_DIR = join(directory, "shots");
  await mkdir(environment.MQMZ_DATA_DIR, { recursive: true });
  await mkdir(environment.MQMZ_SCREENSHOT_DIR, { recursive: true });
  const today = new Date();
  today.setHours(8, 0, 0, 0);
  const todayLater = new Date(today);
  todayLater.setHours(9, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(11, 0, 0, 0);
  await writeFile(
    join(environment.MQMZ_DATA_DIR, "mqmz.focus.json"),
    JSON.stringify({
      version: 2,
      phase: "focus",
      running: false,
      endsAt: null,
      remaining: 1500,
      completed: 2,
      water: true,
      waterInterval: 60,
      waterStart: 9,
      waterEnd: 22,
      waterNextAt: null,
      todos: [],
      todoLists: [],
      todoGroups: [],
      sessions: [
        { id: crypto.randomUUID(), endedAt: today.getTime(), minutes: 25 },
        { id: crypto.randomUUID(), endedAt: todayLater.getTime(), minutes: 25 },
        { id: crypto.randomUUID(), endedAt: yesterday.getTime(), minutes: 25 },
      ],
      waterLog: [],
    }),
    "utf8",
  );
  delete environment.ELECTRON_RUN_AS_NODE;
  launchEnvironment = environment;
  application = await electron.launch({
    args: [resolve(".")],
    env: environment,
  });
  await expect.poll(() => application.windows().length).toBe(22);
  const windows = await Promise.all(
    application
      .windows()
      .map(async (page) => ({ page, title: await page.title() })),
  );
  lab = windows.find((item) => item.title.includes("验证台"))!.page;
  pet = windows.find((item) => item.title.includes("交互标记"))!.page;
  pocket = windows.find((item) => item.title.includes("文件置物架"))!.page;
  ask = windows.find((item) => item.title.includes("智能问答"))!.page;
  convert = windows.find((item) => item.title.includes("文件转换"))!.page;
  rename = windows.find((item) => item.title.includes("批量重命名"))!.page;
  settings = windows.find((item) => item.title.includes("设置"))!.page;
  mail = windows.find((item) => item.title.includes("邮件"))!.page;
  pomodoro = windows.find((item) => item.title.includes("番茄时钟"))!.page;
  water = windows.find((item) => item.title.includes("喝水提醒"))!.page;
  breakPanel = windows.find((item) => item.title.includes("休息提醒"))!.page;
  profile = windows.find((item) => item.title.includes("宠物档案"))!.page;
  clipboard = windows.find((item) => item.title.includes("剪贴板"))!.page;
  focusBadge = windows.find((item) => item.title.includes("计时环"))!.page;
  todo = windows.find((item) => item.title.includes("待办清单"))!.page;
  pill = windows.find((item) => item.title.includes("音乐控制"))!.page;
  startupVisibility = await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((window) => ({
      title: window.getTitle(),
      visible: window.isVisible(),
    })),
  );
  await lab.evaluate(() => window.mqmz!.command({ type: "show-lab" }));
  for (const page of [lab, pet, pocket, ask, convert, rename, settings, mail, pomodoro, water, breakPanel, profile, clipboard, focusBadge, todo, pill]) {
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(message.text());
    });
  }
  await expect(
    lab.getByRole("heading", { name: "透明窗口与拖放", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const result = await lab.evaluate(() => window.mqmz!.snapshot());
      return result.ok && result.value.maskReady;
    })
    .toBe(true);
});

test.afterAll(async () => {
  if (application) await application.close();
});

test("clicking the pet gives feedback without opening the pocket", async () => {
  const pocketVisible = () =>
    application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.getTitle().includes("文件置物架"))!
        .isVisible(),
    );
  const box = await pet.locator(".marker").boundingBox();
  if (!box) throw new Error("Marker is not rendered");
  await pet.bringToFront();
  await pet.mouse.move(4, 4);
  await new Promise((resolve) => setTimeout(resolve, 120));
  await pet.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(pet.locator(".marker")).toHaveAttribute("src", /ponder/);
  await expect.poll(pocketVisible).toBe(false);
  await new Promise((resolve) => setTimeout(resolve, 650));
  await expect(pet.locator(".marker")).not.toHaveAttribute("src", /ponder/);
  await pet.evaluate(() => window.mqmz!.command({ type: "show-pocket" }));
  await expect.poll(pocketVisible).toBe(true);
  await pet.evaluate(() => window.mqmz!.command({ type: "hide-pocket" }));
  await expect.poll(pocketVisible).toBe(false);
});

test("macOS panels use native traffic lights and stay fixed-size", async () => {
  test.skip(process.platform !== "darwin", "macOS-only window chrome");
  const readChrome = () =>
    application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .filter((window) =>
          [
            "文件置物架",
            "智能问答",
            "文件转换",
            "批量重命名",
            "设置",
            "宠物档案",
            "剪贴板",
          ].some(
            (name) => window.getTitle().includes(name),
          ),
        )
        .map((window) => ({
          title: window.getTitle(),
          position: window.getWindowButtonPosition(),
          maximizable: window.isMaximizable(),
          fullScreenable: window.isFullScreenable(),
          closable: window.isClosable(),
          minimizable: window.isMinimizable(),
          alwaysOnTop: window.isAlwaysOnTop(),
        })),
    );
  await expect.poll(async () => (await readChrome()).length).toBe(7);
  const chrome = await readChrome();
  for (const panel of chrome) {
    expect(panel.position).toMatchObject({ x: 14, y: 17 });
    expect(panel.maximizable).toBe(false);
    expect(panel.fullScreenable).toBe(false);
    expect(panel.closable).toBe(true);
    expect(panel.minimizable).toBe(true);
    expect(panel.alwaysOnTop).toBe(
      !panel.title.includes("设置") &&
        !panel.title.includes("宠物档案") &&
        !panel.title.includes("剪贴板"),
    );
  }
  const pocketState = () =>
    application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((item) =>
        item.getTitle().includes("文件置物架"),
      )!;
      return { visible: window.isVisible(), minimized: window.isMinimized() };
    });
  await pet.evaluate(() => window.mqmz!.command({ type: "show-pocket" }));
  await expect.poll(async () => (await pocketState()).visible).toBe(true);
  const closeResult = await pocket.evaluate(() =>
    window.mqmz!.command({ type: "panel-control", action: "close" }),
  );
  expect(closeResult.ok, closeResult.ok ? "" : closeResult.error).toBe(true);
  await expect.poll(async () => (await pocketState()).visible).toBe(false);
});

test("settings panel updates theme, scale, and bubbles", async () => {
  const settingsVisible = () =>
    application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.getTitle().includes("设置"))!
        .isVisible(),
    );
  const dockBefore =
    process.platform === "darwin"
      ? await application.evaluate(({ app }) => app.dock?.isVisible() ?? false)
      : false;
  await pet.evaluate(() => window.mqmz!.command({ type: "show-pocket" }));
  await expect.poll(async () => (await settingsVisible())).toBe(false);
  await pet.evaluate(() => window.mqmz!.command({ type: "settings-open" }));
  await expect.poll(settingsVisible).toBe(true);
  if (process.platform === "darwin" && !dockBefore)
    await expect
      .poll(() => application.evaluate(({ app }) => app.dock?.isVisible()))
      .toBe(true);
  await expect(
    settings.getByRole("heading", { name: "设置", exact: true }),
  ).toBeVisible();
  const settingsCenter = await application.evaluate(({ BrowserWindow, screen }) => {
    const bounds = BrowserWindow.getAllWindows()
      .find((window) => window.getTitle().includes("设置"))!
      .getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    return {
      dx: Math.abs(bounds.x + bounds.width / 2 - (area.x + area.width / 2)),
      dy: Math.abs(bounds.y + bounds.height / 2 - (area.y + area.height / 2)),
    };
  });
  expect(settingsCenter.dx).toBeLessThanOrEqual(1);
  expect(settingsCenter.dy).toBeLessThanOrEqual(1);
  if (process.platform === "darwin") {
    const menu = await application.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()?.items[0]?.submenu?.items.map((item) => item.label),
    );
    expect(menu).toContain("设置…");
  }

  await settings.getByRole("button", { name: "剪贴板", exact: true }).click();
  await expect(settings.getByLabel("剪贴板记录上限")).toHaveValue("100");
  await settings.getByRole("button", { name: "文件置物架", exact: true }).click();
  await expect(
    settings.getByRole("switch", { name: "截图自动放入置物架" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(settings.getByText("截图目录")).toBeVisible();
  await expect(
    settings.getByRole("group", { name: "置物架记录上限" }),
  ).toBeVisible();
  await expect(
    settings.getByRole("group", { name: "归档格式" }),
  ).toBeVisible();
  await settings.getByRole("button", { name: "格式转换", exact: true }).click();
  await expect(
    settings.locator(".engine-section-title").first(),
  ).toHaveText("内置引擎");
  const ffmpegCard = settings.locator(".engine-card", { hasText: "FFmpeg" });
  await expect(ffmpegCard).toContainText("来源");
  const installButton = ffmpegCard.getByRole("button", {
    name: "安装",
    exact: true,
  });
  await expect(installButton).toBeVisible();
  await expect(installButton).toHaveCSS("height", "28px");
  await expect(installButton).toHaveCSS("font-size", "12px");
  await expect(installButton).toHaveCSS("font-weight", "600");
  await expect(
    ffmpegCard.getByRole("button", { name: "使用本地程序…", exact: true }),
  ).toHaveCSS("height", "28px");
  const recheckButton = settings.getByRole("button", {
    name: "重新检查",
    exact: true,
  });
  await expect(recheckButton).toHaveCSS("height", "26px");
  await expect(recheckButton).toHaveCSS("font-size", "12px");
  await expect(recheckButton).toHaveCSS("font-weight", "600");
  await expect(
    settings.locator(".engine-card", { hasText: "sharp" }),
  ).toContainText("可用");
  const libreOfficeCard = settings.locator(".engine-card", {
    hasText: "LibreOffice",
  });
  await expect(libreOfficeCard).toContainText("未选择");
  await expect(
    libreOfficeCard.getByRole("button", {
      name: "使用本地程序…",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(
    settings.locator(".engine-card", { hasText: "qpdf" }),
  ).toContainText("可用");
  await settings.getByRole("button", { name: "外观", exact: true }).click();
  await settings.getByRole("button", { name: "万圣节", exact: true }).click();
  await expect
    .poll(() =>
      pet.evaluate(() =>
        document.documentElement.classList.contains("theme-halloween"),
      ),
    )
    .toBe(true);
  await settings.getByRole("button", { name: "0.75×", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.petBounds.width : 0;
    })
    .toBe(99);

  await expect(settings.locator(".wheel-preview")).toHaveCount(2);
  await expect(settings.locator(".wheel-preview-pet")).toHaveCount(2);
  await settings
    .locator(".wheel-setting", { hasText: "悬停轮盘" })
    .getByRole("button", { name: "配置", exact: true })
    .click();
  const hoverRegion = settings.getByRole("region", { name: "悬停轮盘" });
  await expect(hoverRegion.locator(".wheel-hit")).toHaveCount(10);
  await hoverRegion
    .getByLabel("第 10 项 设置")
    .dragTo(hoverRegion.locator(".wheel-palette"));
  await expect(hoverRegion.locator(".wheel-hit")).toHaveCount(9);
  await expect(
    hoverRegion.getByRole("button", { name: "添加设置", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.settings.hoverWheelActions : [];
    })
    .toEqual(hoverActions.filter((action) => action !== "settings"));
  await hoverRegion
    .getByRole("button", { name: "添加设置", exact: true })
    .dragTo(hoverRegion.locator('[data-gap="0"]'));
  await expect(hoverRegion.locator(".wheel-hit")).toHaveCount(10);
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok
        ? snapshot.value.settings.hoverWheelActions.slice(0, 2)
        : [];
    })
    .toEqual(["settings", "agent"]);
  await hoverRegion
    .getByLabel("第 1 项 设置")
    .dragTo(hoverRegion.locator(".wheel-palette"));
  await expect(hoverRegion.locator(".wheel-hit")).toHaveCount(9);
  await hoverRegion
    .getByRole("button", { name: "添加设置", exact: true })
    .click();
  await expect(hoverRegion.locator(".wheel-hit")).toHaveCount(10);
  await hoverRegion
    .getByLabel("第 1 项 智能体")
    .dragTo(hoverRegion.locator('[data-gap="2"]'));
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok
        ? snapshot.value.settings.hoverWheelActions.slice(0, 2)
        : [];
    })
    .toEqual(["clipboard", "agent"]);
  await hoverRegion
    .getByRole("button", { name: "完成", exact: true })
    .click();
  await expect(hoverRegion).toBeHidden();
  const hoverSetting = settings.locator(".wheel-setting", {
    hasText: "悬停轮盘",
  });
  await expect(
    hoverSetting.getByRole("button", { name: "恢复默认", exact: true }),
  ).toBeVisible();
  await hoverSetting
    .getByRole("button", { name: "恢复默认", exact: true })
    .click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.settings.hoverWheelActions : [];
    })
    .toEqual([...hoverActions]);

  await settings
    .locator(".wheel-setting", { hasText: "文件轮盘" })
    .getByRole("button", { name: "配置", exact: true })
    .click();
  const fileRegion = settings.getByRole("region", { name: "文件轮盘" });
  await expect(fileRegion.locator(".wheel-hit")).toHaveCount(10);
  for (let index = 0; index < 6; index += 1) {
    const hit = fileRegion.locator(".wheel-hit").first();
    await hit.focus();
    await hit.press("Delete");
  }
  await expect(fileRegion.locator(".wheel-hit")).toHaveCount(4);
  const firstFileHit = fileRegion.locator(".wheel-hit").first();
  await firstFileHit.focus();
  await firstFileHit.press("Delete");
  await expect(fileRegion.locator(".wheel-hit")).toHaveCount(4);
  await fileRegion
    .getByRole("button", { name: "恢复默认", exact: true })
    .click();
  await expect(fileRegion.locator(".wheel-hit")).toHaveCount(10);
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.settings.fileWheelActions : [];
    })
    .toEqual([...sliceActions]);
  await fileRegion
    .getByRole("button", { name: "完成", exact: true })
    .click();
  await expect(fileRegion).toBeHidden();
  await expect(settings.locator(".wheel-preview")).toHaveCount(2);

  await settings.getByRole("button", { name: "桌面", exact: true }).click();
  await settings.getByRole("switch", { name: "状态提示气泡" }).click();
  await pet.evaluate(() =>
    window.mqmz!.command({ type: "notify", text: "不应出现" }),
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
  expect(
    await lab.evaluate(async () => {
      const snapshot = await window.mqmz!.snapshot();
      return snapshot.ok ? snapshot.value.toast ?? "" : "";
    }),
  ).toBe("");
  await settings.getByRole("switch", { name: "状态提示气泡" }).click();
  await pet.evaluate(() =>
    window.mqmz!.command({ type: "notify", text: "设置已生效" }),
  );
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.toast ?? "" : "";
    })
    .toContain("设置已生效");

  await settings.getByRole("button", { name: "智能体", exact: true }).click();
  await settings.getByLabel("DeepSeek API Key").fill("sk-settings-test");
  await settings.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.ai.configured : false;
    })
    .toBe(true);
  await settings.getByRole("button", { name: "删除", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.ai.configured : true;
    })
    .toBe(false);

  await settings.getByRole("button", { name: "音乐播放器", exact: true }).click();
  await expect(settings.locator(".bar-style")).toHaveCount(3);
  await settings.getByRole("button", { name: "数据", exact: true }).click();
  await expect(
    settings.locator(".settings-row", { hasText: "失效置物架记录" }),
  ).toBeVisible();
  await settings
    .locator(".settings-row", { hasText: "缓存" })
    .getByRole("button", { name: "清理", exact: true })
    .click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.toast ?? "" : "";
    })
    .toContain("缓存已清理");
  await settings
    .locator(".settings-row", { hasText: "回收区" })
    .getByRole("button", { name: "清空", exact: true })
    .click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.toast ?? "" : "";
    })
    .toContain("回收区已经是空的");

  const stored = JSON.parse(
    await readFile(join(directory, "data", "mqmz.settings.json"), "utf8"),
  );
  expect(stored).toMatchObject({
    theme: "halloween",
    scale: 0.75,
    statusBubbles: true,
    musicBubbles: true,
  });

  await settings.getByRole("button", { name: "外观", exact: true }).click();
  await settings.getByRole("button", { name: "默认", exact: true }).click();
  await settings.getByRole("button", { name: "1×", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.petBounds.width : 0;
    })
    .toBe(132);
  await settings.getByRole("button", { name: "宠物档案", exact: true }).click();
  const petCard = settings.locator(".pet-card").first();
  const petCover = petCard.locator(".pet-cover");
  const coverBox = await petCover.boundingBox();
  expect(coverBox!.width).toBe(coverBox!.height);
  await petCard.click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok && snapshot.value.profileOpen;
    })
    .toBe(true);
  await expect(
    profile.getByRole("heading", { name: "宠物档案" }),
  ).toBeVisible();
  await profile.evaluate(() =>
    window.mqmz!.command({ type: "profile-close" }),
  );
  await settings.evaluate(() =>
    window.mqmz!.command({ type: "panel-control", action: "close" }),
  );
  await expect.poll(settingsVisible).toBe(false);
  if (process.platform === "darwin" && !dockBefore)
    await expect
      .poll(() => application.evaluate(({ app }) => app.dock?.isVisible()))
      .toBe(false);
});

test("hovering the pet centre opens companion tools", async () => {
  const box = await pet.locator(".marker").boundingBox();
  if (!box) throw new Error("Marker is not rendered");
  const hoverRing = async (): Promise<void> => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const current = await pet.locator(".marker").boundingBox();
      if (!current) continue;
      await pet.mouse.move(4, 4);
      await new Promise((resolve) => setTimeout(resolve, 160));
      await pet.mouse.move(
        current.x + current.width / 2,
        current.y + current.height / 2,
      );
      try {
        await expect(pet.locator(".donut-ring")).toBeVisible({
          timeout: 1200,
        });
        return;
      } catch {
        /* retry: the pet window may have just lost focus */
      }
    }
    await expect(pet.locator(".donut-ring")).toBeVisible({ timeout: 3000 });
  };
  await hoverRing();
  await expect(pet.locator(".donut-segment")).toHaveCount(hoverActions.length);
  const labels = (await pet.locator(".donut-label").allTextContents()).join("");
  expect(labels).toContain(
    "智能体剪贴板置物架宠物档案休息提醒待办清单喝水提醒番茄时钟邮件设置",
  );
  for (const label of [
    "番茄",
    "时钟",
    "喝水",
    "提醒",
    "待办",
    "清单",
    "休息",
    "智能",
    "体",
    "宠物",
    "档案",
    "剪贴",
    "板",
    "置物",
    "架",
  ])
    expect(labels).toContain(label);

  const openAt = async (index: number): Promise<void> => {
    const current = await pet.locator(".marker").boundingBox();
    if (!current) throw new Error("Marker is not rendered");
    const metrics = donutMetrics(1);
    const angle = midAngle(index, hoverActions.length);
    const x = current.x + current.width / 2 + metrics.mid * Math.sin(angle);
    const y = current.y + current.height / 2 - metrics.mid * Math.cos(angle);
    await pet.mouse.move(x, y);
    await new Promise((resolve) => setTimeout(resolve, 350));
    await pet.mouse.click(x, y);
  };

  await openAt(0);
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok && snapshot.value.aiOpen;
    })
    .toBe(true);
  await ask.evaluate(() =>
    window.mqmz!.command({ type: "panel-control", action: "close" }),
  );
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok && snapshot.value.aiOpen;
    })
    .toBe(false);

  await hoverRing();
  await openAt(5);
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok && snapshot.value.todoOpen;
    })
    .toBe(true);
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok && snapshot.value.pomodoroOpen;
    })
    .toBe(false);

  await pet.evaluate(() =>
    window.mqmz!.command({ type: "pomodoro-open" }),
  );
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok && snapshot.value.pomodoroOpen;
    })
    .toBe(true);
  await expect(
    pomodoro.getByRole("heading", { name: "番茄时钟" }),
  ).toBeVisible();
  await expect(pomodoro.locator(".focus-date")).toHaveText(
    /^\d{4}年\d{2}月\d{2}日$/,
  );
  await expect(pomodoro.locator(".focus-count")).toHaveText("今日 2 次");
  await expect(pomodoro.locator(".focus-stats-total")).toContainText("本周");
  await expect(pomodoro.locator(".focus-stats-bar")).toHaveCount(7);
  await pomodoro.getByRole("tab", { name: "月", exact: true }).click();
  await expect(pomodoro.locator(".focus-stats-total")).toContainText("本月");
  const monthBars = await pomodoro.locator(".focus-stats-bar").count();
  expect(monthBars).toBeGreaterThanOrEqual(4);
  expect(monthBars).toBeLessThanOrEqual(5);
  await pomodoro.getByRole("tab", { name: "周", exact: true }).click();
  await expect(pomodoro.locator(".focus-stats-bar")).toHaveCount(7);
  await expect(pomodoro.locator(".focus-day-title")).toHaveCount(2);
  await expect(pomodoro.locator(".focus-day-title").first()).toContainText(
    "今天",
  );
  await expect(pomodoro.locator(".focus-session")).toHaveCount(3);
  await expect(
    pomodoro.getByRole("button", { name: /专注/ }),
  ).toContainText("2/4");

  await pomodoro.getByRole("button", { name: "开始", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok && snapshot.value.focus.running;
    })
    .toBe(true);
  await expect(pet.locator(".marker")).toHaveAttribute("src", /focus/);
  const primary = await pomodoro
    .locator(".focus-controls .button-glass")
    .boundingBox();
  const reset = await pomodoro.getByRole("button", { name: "重置" }).boundingBox();
  expect(reset!.width).toBe(primary!.height);
  expect(reset!.height).toBe(primary!.height);
  const badgeVisible = () =>
    application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((item) => item.getTitle().includes("计时环"))!
        .isVisible(),
    );
  await expect.poll(badgeVisible).toBe(false);
  await pomodoro.evaluate(() =>
    window.mqmz!.command({ type: "panel-control", action: "close" }),
  );
  await expect.poll(badgeVisible).toBe(true);
  await pet.evaluate(() =>
    window.mqmz!.command({ type: "pomodoro-open" }),
  );
  await expect.poll(badgeVisible).toBe(false);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await pomodoro.getByRole("button", { name: "暂停", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.focus.remaining : 0;
    })
    .toBeLessThan(1500);
  await pomodoro.getByRole("button", { name: "重置", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.focus.remaining : 0;
    })
    .toBe(1500);
  for (const name of ["增加分钟", "减少分钟", "增加秒", "减少秒"]) {
    await expect(
      pomodoro.getByRole("button", { name, exact: true }),
    ).toHaveCount(1);
  }
  await pomodoro.getByRole("button", { name: "增加分钟", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok
        ? `${snapshot.value.focus.focusMinutes}:${snapshot.value.focus.remaining}`
        : "";
    })
    .toBe("26:1560");
  await pomodoro.getByRole("button", { name: "减少分钟", exact: true }).click();
  await pomodoro.getByRole("button", { name: "增加秒", exact: true }).click();
  await pomodoro.getByRole("button", { name: "增加秒", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok
        ? `${snapshot.value.focus.focusMinutes}:${snapshot.value.focus.focusSeconds}:${snapshot.value.focus.remaining}`
        : "";
    })
    .toBe("25:10:1510");
  await pomodoro.getByRole("button", { name: "减少秒", exact: true }).click();
  await pomodoro.getByRole("button", { name: "减少秒", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok
        ? `${snapshot.value.focus.focusSeconds}:${snapshot.value.focus.remaining}`
        : "";
    })
    .toBe("0:1500");
  const phaseTrack = pomodoro.locator(".focus-phases");
  await expect(phaseTrack).toHaveAttribute("data-active", "focus");
  await pomodoro.getByRole("button", { name: "短休", exact: true }).click();
  await expect(phaseTrack).toHaveAttribute("data-active", "short");
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok
        ? `${snapshot.value.focus.phase}:${snapshot.value.focus.remaining}`
        : "";
    })
    .toBe("short:300");
  await pomodoro.getByRole("button", { name: /^专注/ }).click();
  await expect(phaseTrack).toHaveAttribute("data-active", "focus");

  await pet.evaluate(() => window.mqmz!.command({ type: "water-open" }));
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok && snapshot.value.waterOpen;
    })
    .toBe(true);
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok && snapshot.value.pomodoroOpen;
    })
    .toBe(false);
  await expect(
    water.getByRole("heading", { name: "喝水提醒" }),
  ).toBeVisible();
  await expect(water.getByRole("tab")).toHaveCount(2);
  const movedWater = await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((item) =>
      item.getTitle().includes("喝水提醒"),
    )!;
    window.setBounds({ x: 120, y: 120, width: 360, height: 420 });
    return window.getBounds();
  });
  await water.getByRole("tab", { name: "记录", exact: true }).click();
  await new Promise((resolve) => setTimeout(resolve, 700));
  const stayed = await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((item) => item.getTitle().includes("喝水提醒"))!
      .getBounds(),
  );
  expect(stayed).toEqual(movedWater);
  const waterThumb = await water.locator(".water-tabs-thumb").boundingBox();
  const waterTrack = await water.locator(".water-tabs").boundingBox();
  expect(waterThumb!.x).toBeLessThan(
    waterTrack!.x + waterTrack!.width / 2 - 4,
  );
  await expect(water.locator(".water-today")).toHaveText("今日 0 / 8 次");
  await water.getByRole("button", { name: "记录一次" }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.focus.waterLog.length : 0;
    })
    .toBe(1);
  await expect(water.locator(".water-today")).toHaveText("今日 1 / 8 次");
  await expect(water.locator(".water-entry")).toHaveCount(1);
  await water.getByRole("tab", { name: "设置", exact: true }).click();
  await water.getByLabel("喝水提醒间隔分钟").fill("30");
  await water.getByLabel("喝水提醒间隔分钟").press("Tab");
  await water.getByLabel("喝水提醒开始时间").selectOption("8");
  await water.getByLabel("喝水提醒结束时间").selectOption("21");
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok
        ? `${snapshot.value.focus.waterInterval}:${snapshot.value.focus.waterStart}:${snapshot.value.focus.waterEnd}`
        : "";
    })
    .toBe("30:8:21");
  const goalInput = water.getByLabel("喝水每日目标");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await goalInput.fill("10");
    await goalInput.evaluate((element) =>
      element.dispatchEvent(new Event("change", { bubbles: true })),
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (
      (await lab.evaluate(async () => {
        const snapshot = await window.mqmz!.snapshot();
        return snapshot.ok ? snapshot.value.focus.waterGoal : 0;
      })) === 10
    )
      break;
  }
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.focus.waterGoal : 0;
    })
    .toBe(10);
  await water
    .getByRole("button", { name: "延后 10 分钟", exact: true })
    .click();
  const snoozed = await lab.evaluate(async () => {
    const snapshot = await window.mqmz!.snapshot();
    return snapshot.ok ? snapshot.value.focus.waterNextAt ?? 0 : 0;
  });
  expect(snoozed - Date.now()).toBeGreaterThan(8 * 60 * 1000);
  expect(snoozed - Date.now()).toBeLessThan(12 * 60 * 1000);
  await water.getByRole("switch", { name: "喝水提醒" }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok && snapshot.value.focus.water;
    })
    .toBe(false);
  await water.evaluate(() =>
    window.mqmz!.command({ type: "panel-control", action: "close" }),
  );
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok && snapshot.value.waterOpen;
    })
    .toBe(false);

  await pet.evaluate(() => window.mqmz!.command({ type: "todo-open" }));
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok && snapshot.value.todoOpen;
    })
    .toBe(true);
  await expect(todo.getByRole("heading", { name: "待办清单" })).toBeVisible();
  await expect(todo.locator(".todo-add-list")).toHaveCount(0);
  await expect(
    todo.getByRole("button", { name: "新建清单", exact: true }),
  ).toHaveCount(1);
  await expect(todo.getByRole("tab")).toHaveCount(6);
  await todo.getByLabel("新建待办").fill("悬停轮盘测试");
  await todo.getByRole("button", { name: "添加", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.focus.todos.length : 0;
    })
    .toBe(1);
  await expect(todo.locator(".todo-smart.all .todo-smart-count")).toHaveText("1");
  await todo.locator(".todo-text").first().click();
  await todo.getByLabel("待办标题").fill("悬停轮盘测试 2");
  await todo.getByLabel("待办标题").press("Enter");
  await expect(todo.locator(".todo-text")).toHaveText("悬停轮盘测试 2");
  const dueToday = new Date();
  const dueValue = `${dueToday.getFullYear()}-${String(
    dueToday.getMonth() + 1,
  ).padStart(2, "0")}-${String(dueToday.getDate()).padStart(2, "0")}T13:44`;
  await todo.locator(".todo-text").first().click();
  await todo.getByRole("button", { name: "设置截止日期" }).first().click();
  await expect(todo.getByRole("dialog", { name: "截止日期" })).toBeVisible();
  await todo.getByLabel("截止日期和时间").fill(dueValue);
  await todo.getByRole("button", { name: "保存", exact: true }).click();
  await todo.locator(".todo-main-title").click();
  await expect(todo.locator(".todo-smart.today .todo-smart-count")).toHaveText(
    "1",
  );
  await expect(todo.locator(".todo-view-due")).toContainText("今天 13:44");
  await todo.locator(".todo-text").first().click();
  await todo.getByRole("button", { name: "修改截止日期" }).first().click();
  await todo.getByRole("button", { name: "清除", exact: true }).click();
  const notesInput = todo.getByLabel("备注").first();
  await notesInput.fill("记得带证件");
  await notesInput.press("Tab");
  const tagInput = todo
    .getByRole("textbox", { name: "添加标签" })
    .first();
  await tagInput.fill("工作");
  await tagInput.press("Enter");
  await expect(todo.locator(".todo-inline-tag")).toContainText("#工作");
  await todo.keyboard.press("Escape");
  await expect(todo.locator(".todo-smart.today .todo-smart-count")).toHaveText(
    "0",
  );
  await expect(todo.locator(".todo-view-due")).toHaveCount(0);
  await expect(todo.locator(".todo-view-tag")).toContainText("#工作");
  await expect(
    todo.locator(".todo-tag-chip", { hasText: "#工作" }),
  ).toBeVisible();
  const persistedNotes = await lab.evaluate(async () => {
    const snapshot = await window.mqmz!.snapshot();
    if (!snapshot.ok) return "";
    return (
      snapshot.value.focus.todos.find(
        (item) => item.text === "悬停轮盘测试 2",
      )?.notes ?? ""
    );
  });
  expect(persistedNotes).toBe("记得带证件");
  await todo.locator(".todo-tag-chip", { hasText: "#工作" }).click();
  await expect(todo.locator(".todo-main-title")).toContainText("#工作");
  await expect(todo.locator(".todo-item")).toHaveCount(1);
  await todo.getByRole("tab", { name: /全部/ }).click();
  await todo.locator(".todo-text").first().click();
  await todo.getByRole("button", { name: "设置截止日期" }).first().click();
  await expect(todo.getByRole("dialog", { name: "截止日期" })).toBeVisible();
  await todo.getByLabel("截止日期和时间").fill(dueValue);
  await todo.getByRole("button", { name: "保存", exact: true }).click();
  await todo.getByRole("button", { name: "设置重复" }).first().click();
  await expect(todo.getByRole("menu", { name: "重复规则" })).toBeVisible();
  await todo.getByRole("menuitemradio", { name: "每天" }).click();
  await expect(
    todo.getByRole("button", { name: "重复：每天" }),
  ).toBeVisible();
  await todo.getByRole("button", { name: "标记旗标" }).first().click();
  await todo.locator(".todo-main-title").click();
  await expect(todo.locator(".todo-smart.flagged .todo-smart-count")).toHaveText(
    "1",
  );
  await todo.getByRole("button", { name: "标记完成" }).first().click();
  await expect(todo.locator(".todo-smart.done .todo-smart-count")).toHaveText("1");
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.focus.todos.length : 0;
    })
    .toBe(2);
  const repeatedTodo = await lab.evaluate(async () => {
    const snapshot = await window.mqmz!.snapshot();
    if (!snapshot.ok) return null;
    return snapshot.value.focus.todos.find((item) => !item.done) ?? null;
  });
  expect(repeatedTodo?.repeat).toBe("daily");
  expect(repeatedTodo?.dueAt).toBe(
    new Date(dueValue).getTime() + 24 * 60 * 60 * 1000,
  );
  await todo.getByRole("tab", { name: /已完成/ }).click();
  await expect(todo.locator(".todo-text")).toHaveClass(/done/);
  await todo.getByRole("button", { name: "清除已完成", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.focus.todos.length : 0;
    })
    .toBe(1);
  await todo.getByRole("tab", { name: /全部/ }).click();
  await todo.locator(".todo-text").first().click();
  await todo.getByRole("button", { name: "删除待办" }).first().click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.focus.todos.length : 0;
    })
    .toBe(0);
  await todo.getByRole("tab", { name: /已完成/ }).click();
  await expect(todo.getByLabel("新建待办")).toHaveCount(0);
  await expect(
    todo.getByRole("button", { name: "添加", exact: true }),
  ).toHaveCount(0);
  await todo.getByRole("tab", { name: /全部/ }).click();
  await todo.getByRole("button", { name: "新建组" }).click();
  await expect(todo.getByLabel("组名称")).toBeVisible();
  await todo.getByRole("tab", { name: /全部/ }).click();
  await expect(todo.getByLabel("组名称")).toHaveCount(0);
  await todo.getByRole("button", { name: "新建组" }).click();
  await todo.getByLabel("组名称").fill("临时组");
  await todo.getByRole("tab", { name: /全部/ }).click();
  await expect(todo.getByLabel("组名称")).toHaveValue("临时组");
  await todo.getByRole("button", { name: "取消新建组" }).click();
  await expect(todo.getByLabel("组名称")).toHaveCount(0);
  await todo.getByRole("button", { name: "新建组" }).click();
  await todo.getByLabel("组名称").fill("生活");
  await todo.getByRole("button", { name: "创建组" }).click();
  await expect(todo.getByText("生活", { exact: true })).toBeVisible();
  await todo.getByRole("button", { name: "新建组" }).click();
  await todo.getByLabel("组名称").fill("生活");
  await todo.getByRole("button", { name: "创建组" }).click();
  await expect(todo.locator(".todo-group-name", { hasText: "生活" })).toHaveCount(
    1,
  );
  await todo.getByRole("button", { name: "取消新建组" }).click();
  await todo.getByRole("button", { name: "新建清单", exact: true }).click();
  await expect(todo.getByRole("dialog", { name: "清单设置" })).toBeVisible();
  await todo.getByLabel("清单名称").fill("工作");
  await todo.getByRole("button", { name: "绿色", exact: true }).click();
  await todo.getByRole("button", { name: "选择图标" }).click();
  await expect(todo.getByRole("dialog", { name: "选择图标" })).toBeVisible();
  await todo.getByRole("button", { name: "公文包", exact: true }).click();
  await expect(todo.getByRole("dialog", { name: "选择图标" })).toHaveCount(0);
  await todo.getByRole("button", { name: "创建", exact: true }).click();
  await expect(todo.getByRole("dialog")).toHaveCount(0);
  await todo.getByRole("button", { name: "新建清单", exact: true }).click();
  await todo.getByLabel("清单名称").fill("工作");
  await todo.getByRole("button", { name: "创建", exact: true }).click();
  await expect(todo.getByRole("dialog", { name: "清单设置" })).toBeVisible();
  await todo.getByRole("button", { name: "取消", exact: true }).click();
  const workList = todo.locator(".todo-list-row", { hasText: "工作" });
  await expect(workList.locator(".todo-list-avatar")).toHaveAttribute(
    "data-color",
    "green",
  );
  await expect(workList.locator(".todo-list-avatar")).toHaveAttribute(
    "data-icon",
    "u1F4BC-briefcase",
  );
  await workList.locator(".todo-list-item").click();
  await todo.getByLabel("新建待办").fill("清单里的待办");
  await todo.getByRole("button", { name: "添加", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.focus.todos.length : 0;
    })
    .toBe(1);
  await expect(
    todo.locator(".todo-list-item.active .todo-list-count"),
  ).toHaveText("1");
  await todo.getByRole("tab", { name: /全部/ }).click();
  await todo.getByLabel("新建待办").fill("主分类待办");
  await todo.getByRole("button", { name: "添加", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.focus.todos.length : 0;
    })
    .toBe(2);
  const smartTodo = await lab.evaluate(async () => {
    const snapshot = await window.mqmz!.snapshot();
    if (!snapshot.ok) return null;
    return (
      snapshot.value.focus.todos.find(
        (item) => item.text === "主分类待办",
      ) ?? null
    );
  });
  expect(smartTodo?.listId).toBeNull();
  await workList.hover();
  await workList.getByRole("button", { name: "编辑清单" }).click();
  await todo.getByLabel("清单名称").fill("工作二");
  await todo.getByRole("button", { name: "蓝色", exact: true }).click();
  await todo.getByRole("button", { name: "保存", exact: true }).click();
  await expect(todo.getByRole("dialog")).toHaveCount(0);
  const renamedList = todo.locator(".todo-list-row", { hasText: "工作二" });
  await expect(renamedList.locator(".todo-list-avatar")).toHaveAttribute(
    "data-color",
    "blue",
  );
  await renamedList.getByRole("button", { name: "删除清单" }).click();
  await todo.getByRole("tab", { name: /全部/ }).click();
  await expect(todo.locator(".todo-text")).toHaveCount(2);
  const groupRow = todo.locator(".todo-group-row", { hasText: "生活" });
  await groupRow.click();
  await expect(groupRow).toHaveClass(/selected/);
  await expect(todo.locator(".todo-main-title")).toContainText("生活");
  await expect(
    groupRow.getByRole("button", { name: "在组内新建清单" }),
  ).toHaveCount(0);
  await todo.getByRole("button", { name: "在组内新建清单" }).click();
  await todo.getByLabel("清单名称").fill("家务");
  await todo.getByRole("button", { name: "创建", exact: true }).click();
  await expect(todo.locator(".todo-list-row", { hasText: "家务" })).toBeVisible();
  await todo.locator(".todo-main-title").click({ button: "right" });
  await expect(todo.getByRole("menu")).toBeVisible();
  await todo.keyboard.press("Escape");
  await expect(todo.getByRole("menu")).toHaveCount(0);
  await groupRow.click({ button: "right" });
  await expect(todo.getByRole("menu")).toBeVisible();
  await todo.getByRole("menuitem", { name: "新建清单" }).click();
  await expect(todo.getByRole("dialog", { name: "清单设置" })).toBeVisible();
  await todo.getByRole("button", { name: "取消", exact: true }).click();
  await groupRow.click({ button: "right" });
  await expect(todo.getByRole("menu")).toBeVisible();
  await todo.getByRole("menuitem", { name: "重命名" }).click();
  const renameInput = todo.getByLabel("组名称");
  await expect(renameInput).toHaveValue("生活");
  await renameInput.fill("生活二");
  await renameInput.press("Enter");
  await expect(todo.locator(".todo-group-name", { hasText: "生活二" })).toBeVisible();
  const renamedGroup = todo.locator(".todo-group-row", { hasText: "生活二" });
  await renamedGroup.click({ button: "right" });
  await todo.getByRole("menuitem", { name: "删除" }).click();
  await expect(todo.locator(".todo-group-name", { hasText: "生活二" })).toHaveCount(
    0,
  );
  await expect(todo.locator(".todo-group-row", { hasText: "未分组" })).toBeVisible();
  await expect(todo.locator(".todo-list-row", { hasText: "家务" })).toBeVisible();
  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((window) => window.getTitle().includes("待办清单"))
      ?.close();
  });
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok && snapshot.value.todoOpen;
    })
    .toBe(false);
  await pet.evaluate(() => window.mqmz!.command({ type: "todo-open" }));
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok && snapshot.value.todoOpen;
    })
    .toBe(true);
  await expect(todo.getByRole("heading", { name: "待办清单" })).toBeVisible();
  await pet.evaluate(() =>
    window.mqmz!.command({ type: "profile-open" }),
  );
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok && snapshot.value.profileOpen;
    })
    .toBe(true);
  await expect(
    profile.getByRole("heading", { name: "宠物档案" }),
  ).toBeVisible();
  await profile.getByLabel("宠物名字").fill("布偶");
  await profile.getByRole("button", { name: "保存名字" }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.settings.petName : "";
    })
    .toBe("布偶");
  await expect(pet.locator(".marker-caption")).toHaveText("布偶");
  await profile.evaluate(() =>
    window.mqmz!.command({ type: "profile-close" }),
  );
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok && snapshot.value.profileOpen;
    })
    .toBe(false);

  await pet.evaluate(() =>
    window.mqmz!.command({ type: "clipboard-open" }),
  );
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok && snapshot.value.clipboardOpen;
    })
    .toBe(true);
  await expect(
    clipboard.getByRole("heading", { name: "剪贴板" }),
  ).toBeVisible();
  await clipboard.evaluate(() =>
    window.mqmz!.command({ type: "clipboard-close" }),
  );
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok && snapshot.value.clipboardOpen;
    })
    .toBe(false);

  await pet.evaluate(() => window.mqmz!.command({ type: "show-pocket" }));
  await expect
    .poll(() =>
      application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((window) => window.getTitle().includes("文件置物架"))!
          .isVisible(),
      ),
    )
    .toBe(true);
  await pet.evaluate(() => window.mqmz!.command({ type: "hide-pocket" }));

  await pet.evaluate(() =>
    window.mqmz!.command({ type: "break-open" }),
  );
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok && snapshot.value.breakOpen;
    })
    .toBe(true);
  await expect(
    breakPanel.getByRole("heading", { name: "休息提醒" }),
  ).toBeVisible();
  await expect(breakPanel.getByRole("tab")).toHaveCount(2);
  const sittingSwitch = breakPanel.getByRole("switch", {
    name: "久坐提醒",
  });
  await expect(sittingSwitch).toHaveAttribute("aria-checked", "false");
  await expect(breakPanel.getByLabel("久坐提醒间隔分钟")).toHaveValue("45");
  await sittingSwitch.click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.focus.breakSitting : false;
    })
    .toBe(true);
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.focus.breakSittingNextAt ?? 0 : 0;
    })
    .toBeGreaterThan(Date.now());
  await breakPanel.getByRole("button", { name: "延后 10 分钟" }).click();
  await breakPanel.getByRole("tab", { name: "用眼提醒" }).click();
  const eyesSwitch = breakPanel.getByRole("switch", { name: "用眼提醒" });
  await expect(eyesSwitch).toHaveAttribute("aria-checked", "false");
  await eyesSwitch.click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.focus.breakEyes : false;
    })
    .toBe(true);
  await breakPanel.getByLabel("用眼提醒间隔分钟").selectOption("30");
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.focus.breakEyesInterval : 0;
    })
    .toBe(30);
  const dndSwitch = breakPanel.getByRole("switch", { name: "免打扰" });
  await expect(dndSwitch).toHaveAttribute("aria-checked", "true");
  await dndSwitch.click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.focus.breakDnd : true;
    })
    .toBe(false);
  await breakPanel.getByRole("tab", { name: "久坐提醒" }).click();
  await expect(sittingSwitch).toHaveAttribute("aria-checked", "true");
  await expect
    .poll(async () => {
      const data = JSON.parse(
        await readFile(join(directory, "data", "mqmz.focus.json"), "utf8"),
      );
      return `${data.breakSitting}:${data.breakEyes}:${data.breakEyesInterval}:${data.breakDnd}`;
    })
    .toBe("true:true:30:false");
  await breakPanel.evaluate(() =>
    window.mqmz!.command({ type: "break-close" }),
  );
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok && snapshot.value.breakOpen;
    })
    .toBe(false);
});

test("clipboard history captures, copies, pins, clears and follows settings", async () => {
  const previous = await application.evaluate(async ({ clipboard }) =>
    clipboard.readText(),
  );
  const writeText = async (text: string): Promise<void> => {
    await application.evaluate(
      async ({ clipboard }, value) => clipboard.writeText(value),
      text,
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
  };
  await writeText("剪贴板测试一");
  await writeText("剪贴板测试二");
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok
        ? snapshot.value.clipboard.entries.some(
            (entry) => entry.text === "剪贴板测试二",
          )
        : false;
    })
    .toBe(true);
  await pet.evaluate(() =>
    window.mqmz!.command({ type: "clipboard-open" }),
  );
  await expect(
    clipboard.getByRole("heading", { name: "剪贴板" }),
  ).toBeVisible();
  const first = clipboard.locator(".clipboard-entry").first();
  await expect(first).toContainText("剪贴板测试二");
  await clipboard.getByLabel("搜索剪贴板").fill("测试二");
  await expect(clipboard.locator(".clipboard-entry")).toHaveCount(1);
  await clipboard.getByRole("button", { name: "清空搜索" }).click();
  await expect(clipboard.getByLabel("搜索剪贴板")).toHaveValue("");
  await first.locator(".clipboard-copy").click();
  await expect
    .poll(() =>
      application.evaluate(async ({ clipboard }) => clipboard.readText()),
    )
    .toBe("剪贴板测试二");
  await first.getByRole("button", { name: "固定记录" }).click();
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.clipboard.entries[0]?.pinned : false;
    })
    .toBe(true);
  await clipboard
    .getByRole("button", { name: "清空未固定记录" })
    .click();
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.clipboard.entries.length : 0;
    })
    .toBe(1);
  await clipboard
    .getByRole("tab", { name: "设置", exact: true })
    .click();
  await expect(
    clipboard.locator(".clip-setting-row", { hasText: "字符上限" }),
  ).toContainText("10,000 字");
  await expect(clipboard.getByLabel("剪贴板记录上限")).toHaveValue("100");
  await clipboard.getByRole("switch", { name: "监听剪贴板" }).click();
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.clipboard.enabled : true;
    })
    .toBe(false);
  await writeText("关闭后不应记录");
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.clipboard.entries.length : 0;
    })
    .toBe(1);
  await application.evaluate(
    async ({ clipboard }, value) => clipboard.writeText(value),
    previous,
  );
  await clipboard
    .getByRole("tab", { name: "记录", exact: true })
    .click();
  await clipboard
    .locator(".clipboard-entry")
    .first()
    .getByRole("button", { name: "删除记录" })
    .click();
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.clipboard.entries.length : 0;
    })
    .toBe(0);
  await clipboard.evaluate(() =>
    window.mqmz!.command({ type: "clipboard-close" }),
  );
});

test("screenshot files auto-enter the shelf and follow the switch", async () => {
  const png = await readFile(
    resolve("src/renderer/assets/pet/ragdoll/base.png"),
  );
  const screenshotPath = join(directory, "shots", "Screenshot e2e.png");
  await writeFile(screenshotPath, png);
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok
        ? snapshot.value.files.some((file) => file.name === "Screenshot e2e.png")
        : false;
    })
    .toBe(true);
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.toast ?? "" : "";
    })
    .toContain("截图已放入置物架");
  await rm(screenshotPath, { force: true });
  await pet.evaluate(() => window.mqmz!.command({ type: "shelf-scan" }));
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.shelfInvalidCount : 0;
    })
    .toBe(1);
  await pet.evaluate(() =>
    window.mqmz!.command({ type: "shelf-clear-invalid" }),
  );
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok
        ? snapshot.value.files.some(
            (file) => file.name === "Screenshot e2e.png",
          )
        : true;
    })
    .toBe(false);
  await pet.evaluate(() =>
    window.mqmz!.command({
      type: "settings-update",
      patch: { shelfAutoScreenshots: false },
    }),
  );
  await writeFile(
    join(directory, "shots", "Screenshot ignored.png"),
    png,
  );
  await new Promise((resolve) => setTimeout(resolve, 2600));
  const afterOff = await pet.evaluate(() => window.mqmz!.snapshot());
  expect(
    afterOff.ok
      ? afterOff.value.files.some(
          (file) => file.name === "Screenshot ignored.png",
        )
      : true,
  ).toBe(false);
  await pet.evaluate(() =>
    window.mqmz!.command({
      type: "settings-update",
      patch: { shelfAutoScreenshots: true },
    }),
  );
  await writeFile(
    join(directory, "shots", "Screenshot resumed.png"),
    png,
  );
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok
        ? snapshot.value.files.some(
            (file) => file.name === "Screenshot resumed.png",
          )
        : false;
    })
    .toBe(true);
  const snapshot = await pet.evaluate(() => window.mqmz!.snapshot());
  if (snapshot.ok)
    for (const file of snapshot.value.files.filter((item) =>
      item.name.startsWith("Screenshot "),
    ))
      await pet.evaluate(
        (id) => window.mqmz!.command({ type: "remove-file", fileId: id }),
        file.id,
      );
});

test("actual Electron windows render with isolation, transparency, and a pixel mask", async () => {
  expect(
    startupVisibility.find((window) => window.title.includes("验证台"))
      ?.visible,
  ).toBe(false);
  expect(
    startupVisibility.find((window) => window.title.includes("文件置物架"))
      ?.visible,
  ).toBe(false);
  expect(
    startupVisibility.find((window) => window.title.includes("交互标记"))
      ?.visible,
  ).toBe(true);
  expect(
    startupVisibility.find((window) => window.title.includes("待办清单"))
      ?.visible,
  ).toBe(false);
  expect(
    startupVisibility.find((window) => window.title.includes("番茄时钟"))
      ?.visible,
  ).toBe(false);
  expect(
    startupVisibility.find((window) => window.title.includes("喝水提醒"))
      ?.visible,
  ).toBe(false);
  expect(
    startupVisibility.find((window) => window.title.includes("休息提醒"))
      ?.visible,
  ).toBe(false);
  expect(
    startupVisibility.find((window) => window.title.includes("宠物档案"))
      ?.visible,
  ).toBe(false);
  expect(
    startupVisibility.find((window) => window.title.includes("剪贴板"))
      ?.visible,
  ).toBe(false);
  expect(
    startupVisibility.find((window) => window.title.includes("智能问答"))
      ?.visible,
  ).toBe(false);
  expect(
    startupVisibility.find((window) => window.title.includes("文件转换"))
      ?.visible,
  ).toBe(false);
  expect(lab.url()).toMatch(/^file:/);
  await expect(lab).toHaveTitle("毛趣萌仔 · P0 验证台");
  await expect(pet.locator(".marker")).toBeVisible();
  await expect(lab.locator(".file-outline")).toHaveClass(/lucide-inbox/);
  await expect(pocket.locator(".panel-title h1")).toHaveText("文件置物架");
  await expect(pocket.locator(".panel-win-controls")).toHaveCount(0);
  await expect(pill.locator(".pill-cover")).toHaveCount(1);
  await expect(pill.locator(".pill-meta")).toHaveCount(1);
  const version = await lab.evaluate(() => window.mqmz!.snapshot());
  expect(version.ok && version.value.runtime.version).toBe("0.0.1");
  expect(await lab.locator("vite-error-overlay").count()).toBe(0);
  const details = await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((window) => ({
      title: window.getTitle(),
      background: window.getBackgroundColor(),
      bounds: window.getBounds(),
    })),
  );
  expect(
    details.find((window) => window.title.includes("交互标记"))?.background,
  ).toMatch(/#00000000|#0000/);
  expect(
    await lab.evaluate(
      () => typeof (window as unknown as { require?: unknown }).require,
    ),
  ).toBe("undefined");
  expect(await lab.evaluate(() => window.mqmz!.bridgeStatus)).toEqual({
    sandboxed: true,
    contextIsolated: true,
  });
  expect(await pet.evaluate(() => window.mqmz!.bridgeStatus)).toEqual({
    sandboxed: true,
    contextIsolated: true,
  });
  const isolated = await application.evaluate(async ({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows().find((window) =>
      window.getTitle().includes("验证台"),
    )!.webContents;
    return contents.executeJavaScript(
      "({ isolated: window.crossOriginIsolated, node: typeof process, require: typeof require })",
    );
  });
  expect(isolated.node).toBe("undefined");
  expect(isolated.require).toBe("undefined");
  await lab.screenshot({ path: "/tmp/mqmz-p0-lab.png" });
  await pet.screenshot({
    path: "/tmp/mqmz-p0-marker.png",
    omitBackground: true,
  });
});

test("controls resize the real native window and switch the whole file receiving region", async () => {
  await lab.locator("#marker-scale").selectOption("2");
  await expect
    .poll(async () =>
      application.evaluate(
        ({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((w) => w.getTitle().includes("交互标记"))!
            .getBounds().width,
      ),
    )
    .toBe(264);
  await lab.getByTestId("drop-mode").click();
  // The pet stays visible; the donut appears during a real drag, not on a toggle.
  await expect(pet.locator(".marker")).toBeVisible();
  const dropping = await lab.evaluate(() => window.mqmz!.snapshot());
  expect(
    dropping.ok && dropping.value.dropMode && !dropping.value.passthrough,
  ).toBe(true);
  await lab.getByTestId("drop-mode").click();
  await expect(pet.locator(".marker")).toBeVisible();
  await lab.locator("#marker-scale").selectOption("1");
});

test("real macOS cursor positions switch hit handling and drive the IPC drag controller", async () => {
  const helper = process.env.MQMZ_CURSOR_HELPER;
  test.skip(
    process.platform !== "darwin" || !helper,
    "Optional macOS cursor helper is not configured.",
  );
  const original = await application.evaluate(({ screen }) =>
    screen.getCursorScreenPoint(),
  );
  const before = await lab.evaluate(() => window.mqmz!.snapshot());
  if (!before.ok) throw new Error(before.error);
  const b = before.value.petBounds;
  const image = await pet.locator(".marker").boundingBox();
  if (!image) throw new Error("Marker is not rendered");
  const hitPoints = await pet.locator(".marker").evaluate((element) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 96;
    const context = canvas.getContext("2d")!;
    context.drawImage(element as HTMLImageElement, 0, 0, 96, 96);
    const rgba = context.getImageData(0, 0, 96, 96).data;
    const candidates: { x: number; y: number }[] = [];
    for (let y = 2; y < 94; y++)
      for (let x = 2; x < 94; x++) {
        if (
          [-1, 0, 1].every((dy) =>
            [-1, 0, 1].every(
              (dx) => rgba[((y + dy) * 96 + x + dx) * 4 + 3] > 200,
            ),
          )
        )
          candidates.push({ x, y });
      }
    candidates.sort(
      (a, b) => Math.hypot(a.x - 48, a.y - 60) - Math.hypot(b.x - 48, b.y - 60),
    );
    if (!candidates.length)
      throw new Error("No stable opaque pixels in marker");
    // Outside the silhouette: enclosed holes are intentionally draggable.
    const transparent = { x: 4, y: 4 };
    // Use an interior empty region, clear of SVG antialiasing and DIP rounding.
    const clearPoints = [] as { x: number; y: number }[];
    for (let y = 3; y < 93; y++)
      for (let x = 3; x < 93; x++)
        if (
          [-2, -1, 0, 1, 2].every((dy) =>
            [-2, -1, 0, 1, 2].every(
              (dx) => rgba[((y + dy) * 96 + x + dx) * 4 + 3] === 0,
            ),
          )
        )
          clearPoints.push({ x, y });
    clearPoints.sort(
      (a, b) =>
        Math.hypot(a.x - transparent.x, a.y - transparent.y) -
        Math.hypot(b.x - transparent.x, b.y - transparent.y),
    );
    if (!clearPoints.length)
      throw new Error("No stable transparent pixels in marker");
    return {
      opaque: candidates[0],
      transparent: clearPoints[0],
    };
  });
  const startX =
    b.x + image.x + ((hitPoints.opaque.x + 0.5) * image.width) / 96;
  const startY =
    b.y + image.y + ((hitPoints.opaque.y + 0.5) * image.height) / 96;
  const warp = async (x: number, y: number) => {
    await promisify(execFile)(helper!, [String(x), String(y)]);
  };
  const ignored = async () => {
    const result = await lab.evaluate(() => window.mqmz!.snapshot());
    return result.ok && result.value.passthrough;
  };
  try {
    await warp(b.x + 2, b.y + 2);
    await expect.poll(ignored).toBe(true);
    await warp(startX, startY);
    await expect.poll(ignored).toBe(false);
    await warp(
      b.x + image.x + ((hitPoints.transparent.x + 0.5) * image.width) / 96,
      b.y + image.y + ((hitPoints.transparent.y + 0.5) * image.height) / 96,
    );
    await expect.poll(ignored).toBe(true);
    await warp(startX, startY);
    await pet.evaluate(() => window.mqmz!.pointer("down"));
    await warp(startX - 60, startY - 60);
    await pet.evaluate(() => window.mqmz!.pointer("up"));
    const afterDrag = await lab.evaluate(() => window.mqmz!.snapshot());
    expect(afterDrag.ok && afterDrag.value.petBounds.x).toBe(b.x - 60);
    expect(afterDrag.ok && afterDrag.value.petBounds.y).toBe(b.y - 60);
  } finally {
    await lab.evaluate(() => window.mqmz!.command({ type: "recover" }));
    await warp(original.x, original.y);
  }
});

test("OS-backed File objects reach the real local registry; removal preserves source files", async () => {
  const fixture = join(directory, "验证 空格&文件.txt");
  await writeFile(fixture, "mqmz local integration fixture\n");
  // A real disk-backed browser File is injected, not a mock path or demo record.
  // The pet's drag donut has its own tests below; this one covers the shelf path.
  await pocket.evaluate(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.id = "mqmz-test-file";
    input.hidden = true;
    document.body.append(input);
  });
  await pocket.locator("#mqmz-test-file").setInputFiles(fixture);
  const registration = await pocket
    .locator("#mqmz-test-file")
    .evaluate((element) =>
      window.mqmz!.receiveFiles([...(element as HTMLInputElement).files!]),
    );
  expect(registration.ok).toBe(true);
  await expect(lab.getByTestId("file-row")).toHaveCount(1);
  await expect(pocket.getByTestId("pocket-file")).toHaveCount(1);
  await expect(
    pocket.getByRole("button", { name: "新增文件", exact: true }),
  ).toBeVisible();
  await expect(
    pocket.getByRole("button", { name: "格式转换", exact: true }),
  ).toBeVisible();
  await expect(
    pocket.getByRole("button", { name: "移出置物架", exact: true }),
  ).toBeVisible();
  await expect(
    pocket.getByRole("button", { name: "定位源文件", exact: true }),
  ).toBeVisible();
  await expect(pocket.getByText(/暂存/)).toHaveCount(0);
  await expect(pocket.getByTestId("pocket-file")).toHaveAttribute(
    "draggable",
    "true",
  );
  await expect(pocket.locator(".pocket-file-symbol img")).toHaveCount(1);
  await expect(pocket.locator(".pocket-file-symbol img")).toHaveAttribute(
    "src",
    /txt|data:image\/svg/,
  );
  await expect(pocket.locator(".pocket-drag-icon")).toHaveClass(
    /lucide-grip-vertical/,
  );
  for (const icon of await pocket.locator("svg").all()) {
    await expect(icon).toHaveAttribute("viewBox", "0 0 24 24");
    await expect(icon).toHaveAttribute("stroke-width", "2");
    await expect(icon).toHaveAttribute("aria-hidden", "true");
  }
  await expect(pocket.getByRole("button", { name: /^拖出/ })).toHaveCount(0);
  await expect(
    pocket.getByRole("button", { name: "格式转换", exact: true }),
  ).toBeEnabled();
  const themes = [
    {
      id: "default",
      className: "",
      brand: "#d7785e",
      canvas: "rgb(251, 249, 245)",
      ink: "rgb(173, 89, 70)",
    },
    {
      id: "halloween",
      className: "theme-halloween",
      brand: "#8d6b96",
      canvas: "rgb(251, 248, 251)",
      ink: "rgb(118, 86, 126)",
    },
    {
      id: "christmas",
      className: "theme-christmas",
      brand: "#618775",
      canvas: "rgb(248, 250, 246)",
      ink: "rgb(77, 113, 94)",
    },
  ];
  for (const theme of themes) {
    await pocket.evaluate((className) => {
      document.documentElement.classList.remove(
        "theme-halloween",
        "theme-christmas",
      );
      if (className) document.documentElement.classList.add(className);
    }, theme.className);
    await pocket.mouse.move(2, 2);
    await expect(pocket.locator(".pocket-add")).toHaveCSS(
      "background-color",
      theme.ink,
    );
    const styles = await pocket.evaluate(() => {
      const action = document.querySelector<HTMLButtonElement>(".pocket-add")!;
      const secondary =
        document.querySelectorAll<HTMLButtonElement>(".pocket-actions .button-soft")[0]!;
      const actions = document
        .querySelector(".pocket-actions")!
        .getBoundingClientRect();
      return {
        brand: getComputedStyle(document.documentElement)
          .getPropertyValue("--color-brand")
          .trim(),
        canvas: getComputedStyle(document.querySelector(".pocket-surface")!)
          .backgroundColor,
        ink: getComputedStyle(action).backgroundColor,
        primaryBorder: getComputedStyle(action).borderColor,
        iconCount: document.querySelectorAll(".pocket-file-symbol img").length,
        color: getComputedStyle(
          document.querySelector(".pocket-file-name")!,
        ).color,
        bodySize: getComputedStyle(action).fontSize,
        height: action.getBoundingClientRect().height,
        widthDifference: Math.abs(
          action.getBoundingClientRect().width -
            secondary.getBoundingClientRect().width,
        ),
        actionsVisible: actions.bottom <= innerHeight - 6,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(styles.brand).toBe(theme.brand);
    expect(styles.canvas).toBe(theme.canvas);
    expect(styles.ink).toBe(theme.ink);
    expect(styles.primaryBorder).toBe("rgba(0, 0, 0, 0)");
    expect(styles.iconCount).toBe(1);
    expect(styles.color).toBe("rgb(26, 26, 26)");
    expect(styles.bodySize).toBe("12px");
    expect(styles.height).toBeGreaterThanOrEqual(34);
    expect(styles.widthDifference).toBeLessThanOrEqual(1);
    expect(styles.actionsVisible).toBe(true);
    expect(styles.horizontalOverflow).toBe(false);
    await pocket.screenshot({
      path: `/tmp/mqmz-file-pocket-${theme.id}.png`,
      omitBackground: true,
    });
  }
  await pocket.evaluate(() =>
    document.documentElement.classList.remove(
      "theme-halloween",
      "theme-christmas",
    ),
  );
  await expect(pocket.locator(".pocket-add")).toHaveCSS(
    "background-color",
    themes[0].ink,
  );
  await pocket.screenshot({
    path: "/tmp/mqmz-file-pocket.png",
    omitBackground: true,
  });
  const positions = await application.evaluate(({ BrowserWindow, screen }) => {
    const panel = BrowserWindow.getAllWindows().find((window) =>
      window.getTitle().includes("文件置物架"),
    )!;
    const marker = BrowserWindow.getAllWindows().find((window) =>
      window.getTitle().includes("交互标记"),
    )!;
    return {
      panel: panel.getBounds(),
      marker: marker.getBounds(),
      display: screen.getDisplayMatching(panel.getBounds()).id,
      markerDisplay: screen.getDisplayMatching(marker.getBounds()).id,
    };
  });
  expect(positions.panel.width).toBe(352);
  expect(positions.display).toBe(positions.markerDisplay);
  await expect(
    lab.getByText("验证 空格&文件.txt", { exact: true }),
  ).toBeVisible();
  expect(await readFile(fixture, "utf8")).toBe(
    "mqmz local integration fixture\n",
  );
  const state = await lab.evaluate(() => window.mqmz!.snapshot());
  expect(JSON.stringify(state)).not.toContain(directory);
  await lab
    .getByRole("button", { name: "移除 验证 空格&文件.txt 的记录" })
    .click();
  await expect(lab.getByTestId("file-row")).toHaveCount(0);
  expect(await readFile(fixture, "utf8")).toBe(
    "mqmz local integration fixture\n",
  );
  await pocket
    .locator("#mqmz-test-file")
    .evaluate((element) => element.remove());
});

test("file-card drag gestures dispatch the system drag capability rather than a drag button", async () => {
  const fixture = join(directory, "拖动文件卡片.txt");
  await writeFile(fixture, "drag-card-fixture");
  await pocket.evaluate(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.id = "mqmz-card-input";
    document.body.append(input);
  });
  await pocket.locator("#mqmz-card-input").setInputFiles(fixture);
  const registration = await pocket
    .locator("#mqmz-card-input")
    .evaluate((element) =>
      window.mqmz!.receiveFiles([...(element as HTMLInputElement).files!]),
    );
  expect(registration.ok).toBe(true);
  // Observe the real IPC dispatch without entering an OS drag loop that needs a physical release.
  await application.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows().find((window) =>
      window.getTitle().includes("文件置物架"),
    )!.webContents;
    (globalThis as unknown as { mqmzObservedDrag?: string }).mqmzObservedDrag =
      undefined;
    contents.startDrag = (item: Electron.Item) => {
      (
        globalThis as unknown as { mqmzObservedDrag?: string }
      ).mqmzObservedDrag = item.file;
    };
  });
  await pocket
    .getByRole("button", { name: "文件 拖动文件卡片.txt", exact: true })
    .dispatchEvent("dragstart");
  await expect
    .poll(() =>
      application.evaluate(
        () =>
          (globalThis as unknown as { mqmzObservedDrag?: string })
            .mqmzObservedDrag,
      ),
    )
    .toBe(await realpath(fixture));
  await pocket.getByRole("button", { name: "移出置物架", exact: true }).click();
  await pocket
    .locator("#mqmz-card-input")
    .evaluate((element) => element.remove());
  expect(await readFile(fixture, "utf8")).toBe("drag-card-fixture");
});

async function dropOnPet(
  fixture: string | string[],
  target: "center" | "outside" | DropAction,
): Promise<void> {
  const fixtures = Array.isArray(fixture) ? fixture : [fixture];
  const metrics = donutMetrics(1);
  await pet.evaluate(() => {
    document.querySelector("#mqmz-drop-input")?.remove();
    const input = document.createElement("input");
    input.type = "file";
    input.id = "mqmz-drop-input";
    input.multiple = true;
    input.hidden = true;
    document.body.append(input);
  });
  await pet.locator("#mqmz-drop-input").setInputFiles(fixtures);
  await pet.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>("#mqmz-drop-input")!;
    const transfer = new DataTransfer();
    for (const file of input.files!) transfer.items.add(file);
    document.querySelector(".pet-surface")!.dispatchEvent(
      new DragEvent("dragenter", {
        dataTransfer: transfer,
        bubbles: true,
        cancelable: true,
        clientX: 2,
        clientY: 2,
      }),
    );
  });
  await expect(pet.locator(".donut-ring")).toBeVisible();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.petBounds.width : 0;
    })
    .toBe(metrics.window);
  await pet.waitForFunction(
    (width) => innerWidth === width,
    metrics.window,
  );
  // The slices only answer once the wheel has opened around the pet.
  await pet.waitForTimeout(320);
  const box = await pet.locator(".marker").boundingBox();
  if (!box) throw new Error("Marker is not rendered");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const point =
    target === "center"
      ? { x: cx, y: cy }
      : target === "outside"
        ? { x: cx, y: cy + metrics.outer + 12 }
        : pointOnSlice(target, cx, cy);
  if (target !== "center" && target !== "outside") {
    await pet.evaluate(({ x, y }) => {
      const input = document.querySelector<HTMLInputElement>("#mqmz-drop-input")!;
      const transfer = new DataTransfer();
      for (const file of input.files!) transfer.items.add(file);
      document.querySelector(".pet-surface")!.dispatchEvent(
        new DragEvent("dragover", {
          dataTransfer: transfer,
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
        }),
      );
    }, point);
    await expect(pet.locator(`[data-region="${target}"]`)).toHaveClass(
      /active/,
    );
  }
  await pet.evaluate(({ x, y }) => {
    const input = document.querySelector<HTMLInputElement>("#mqmz-drop-input")!;
    const transfer = new DataTransfer();
    for (const file of input.files!) transfer.items.add(file);
    document.querySelector(".pet-surface")!.dispatchEvent(
      new DragEvent("drop", {
        dataTransfer: transfer,
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      }),
    );
  }, point);
}

function pointOnSlice(
  action: DropAction,
  cx: number,
  cy: number,
): { x: number; y: number } {
  const metrics = donutMetrics(1);
  const angle = midAngle(
    sliceActions.indexOf(action),
    sliceActions.length,
  );
  return {
    x: cx + metrics.mid * Math.sin(angle),
    y: cy - metrics.mid * Math.cos(angle),
  };
}

async function hoverSlice(action: DropAction): Promise<void> {
  const box = await pet.locator(".marker").boundingBox();
  if (!box) throw new Error("Marker is not rendered");
  const point = pointOnSlice(action, box.x + box.width / 2, box.y + box.height / 2);
  await pet.evaluate(({ x, y }) => {
    const input = document.querySelector<HTMLInputElement>("#mqmz-donut-input")!;
    const transfer = new DataTransfer();
    for (const file of input.files!) transfer.items.add(file);
    document.querySelector(".pet-surface")!.dispatchEvent(
      new DragEvent("dragover", {
        dataTransfer: transfer,
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      }),
    );
  }, point);
  await expect(pet.locator(`[data-region="${action}"]`)).toHaveClass(/active/);
}

test("dragging over the pet opens ten equal slices and Esc closes them", async () => {
  const fixture = join(directory, "拖拽预览.txt");
  await writeFile(fixture, "donut preview");
  await pet.evaluate(() => {
    document.querySelector("#mqmz-donut-input")?.remove();
    const input = document.createElement("input");
    input.type = "file";
    input.id = "mqmz-donut-input";
    input.hidden = true;
    document.body.append(input);
  });
  await pet.locator("#mqmz-donut-input").setInputFiles(fixture);
  await pet.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>("#mqmz-donut-input")!;
    const transfer = new DataTransfer();
    for (const file of input.files!) transfer.items.add(file);
    document.querySelector(".pet-surface")!.dispatchEvent(
      new DragEvent("dragenter", {
        dataTransfer: transfer,
        bubbles: true,
        cancelable: true,
        clientX: 2,
        clientY: 2,
      }),
    );
  });
  await expect(pet.locator(".donut-ring")).toBeVisible();
  await expect(pet.locator(".donut-segment")).toHaveCount(sliceCount);
  for (const action of sliceActions) {
    await expect(pet.locator(`[data-region="${action}"]`)).toContainText(
      sliceLabels[action],
    );
  }
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.petBounds.width : 0;
    })
    .toBe(donutMetrics(1).window);
  await pet.waitForFunction(
    (width) => innerWidth === width,
    donutMetrics(1).window,
  );
  await pet.waitForTimeout(320);

  await hoverSlice("stash");
  await pet.waitForTimeout(240);
  await pet.screenshot({ path: "/tmp/mqmz-donut.png", omitBackground: true });
  await hoverSlice("eat");
  await pet.waitForTimeout(240);
  await pet.screenshot({
    path: "/tmp/mqmz-donut-eat.png",
    omitBackground: true,
  });
  await hoverSlice("convert");
  await pet.waitForTimeout(240);
  await pet.screenshot({
    path: "/tmp/mqmz-donut-convert.png",
    omitBackground: true,
  });

  await pet.keyboard.press("Escape");
  await expect(pet.locator(".donut-ring")).toHaveCount(0);
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok
        ? `${snapshot.value.wheelOpen}:${snapshot.value.petBounds.width}`
        : "";
    })
    .toBe("false:132");
  const state = await lab.evaluate(() => window.mqmz!.snapshot());
  expect(state.ok && state.value.files.length).toBe(0);
  await pet
    .locator("#mqmz-donut-input")
    .evaluate((element) => element.remove());
});

test("dropping on 智能问答 opens the DeepSeek setup", async () => {
  const fixture = join(directory, "问答资料.txt");
  await writeFile(fixture, "这是一份用来提问的资料。");
  await dropOnPet(fixture, "ask");
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.aiOpen : false;
    })
    .toBe(true);
  await expect(
    ask.getByRole("heading", { name: "连接 DeepSeek", exact: true }),
  ).toBeVisible();
  await expect(ask.getByLabel("DeepSeek API Key")).toBeVisible();
  const askCenter = await application.evaluate(({ BrowserWindow, screen }) => {
    const bounds = BrowserWindow.getAllWindows()
      .find((window) => window.getTitle().includes("智能问答"))!
      .getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    return {
      dx: Math.abs(bounds.x + bounds.width / 2 - (area.x + area.width / 2)),
      dy: Math.abs(bounds.y + bounds.height / 2 - (area.y + area.height / 2)),
    };
  });
  expect(askCenter.dx).toBeLessThanOrEqual(1);
  expect(askCenter.dy).toBeLessThanOrEqual(1);
  await ask.evaluate(() =>
    window.mqmz!.command({ type: "panel-control", action: "close" }),
  );
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.aiOpen : true;
    })
    .toBe(false);
  const registered = await lab.evaluate(() => window.mqmz!.snapshot());
  const file = registered.ok
    ? registered.value.files.find((item) => item.name === "问答资料.txt")
    : undefined;
  if (file)
    await lab.evaluate(
      (fileId) => window.mqmz!.command({ type: "remove-file", fileId }),
      file.id,
    );
});

test("格式转换缺少 FFmpeg 时打开设置而不是空面板", async () => {
  await settings.evaluate(() =>
    window.mqmz!.command({ type: "settings-close" }),
  );
  const fixture = join(directory, "转换视频.mp4");
  await writeFile(fixture, "placeholder");
  await dropOnPet(fixture, "convert");
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      if (!snapshot.ok) return null;
      return {
        settings: snapshot.value.settingsOpen,
        section: snapshot.value.settingsSection,
        convert: snapshot.value.convertOpen,
        toast: snapshot.value.toast ?? "",
      };
    })
    .toMatchObject({
      settings: true,
      section: "conversion",
      convert: false,
      toast: "音视频转换需要先安装 FFmpeg",
    });
  await expect(
    settings.getByRole("button", { name: "格式转换", exact: true }),
  ).toHaveClass(/active/);
  await expect(
    settings.locator(".engine-card", { hasText: "FFmpeg" }),
  ).toBeVisible();
  const registered = await lab.evaluate(() => window.mqmz!.snapshot());
  const file = registered.ok
    ? registered.value.files.find((item) => item.name === "转换视频.mp4")
    : undefined;
  if (file)
    await lab.evaluate(
      (fileId) => window.mqmz!.command({ type: "remove-file", fileId }),
      file.id,
    );
  await settings.evaluate(() =>
    window.mqmz!.command({ type: "settings-close" }),
  );
});

test("dropping on 格式转换 converts an image beside the source", async () => {
  const fixture = join(directory, "转换图片.png");
  await sharp({
    create: { width: 20, height: 20, channels: 3, background: "#336699" },
  })
    .png()
    .toFile(fixture);
  await dropOnPet(fixture, "convert");
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.convertOpen : false;
    })
    .toBe(true);
  await expect(
    convert.getByRole("heading", { name: "文件转换", exact: true }),
  ).toBeVisible();
  await convert.getByRole("button", { name: "WEBP", exact: true }).click();
  await convert.getByRole("button", { name: "开始转换", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.convert.outcome?.converted : 0;
    })
    .toBe(1);
  const output = join(directory, "转换图片.webp");
  expect((await stat(output)).size).toBeGreaterThan(0);
  await expect(convert.locator(".convert-preview")).toHaveCount(1);
  await expect(convert.locator(".convert-preview img")).toHaveAttribute(
    "src",
    /^data:image\//,
  );
  await convert.getByRole("button", { name: "完成", exact: true }).click();
  const registered = await lab.evaluate(() => window.mqmz!.snapshot());
  const file = registered.ok
    ? registered.value.files.find((item) => item.name === "转换图片.png")
    : undefined;
  if (file)
    await lab.evaluate(
      (fileId) => window.mqmz!.command({ type: "remove-file", fileId }),
      file.id,
    );
});

test("PDF 转 PNG/TXT，TXT 转 PDF", async () => {
  const pdfFixture = join(directory, "PDF转换.pdf");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([300, 200]);
  page.drawText("PDF page one", {
    x: 24,
    y: 150,
    size: 18,
    font,
    color: rgb(0, 0, 0),
  });
  await writeFile(pdfFixture, await pdf.save());

  await dropOnPet(pdfFixture, "convert");
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.convertOpen : false;
    })
    .toBe(true);
  await convert.getByRole("button", { name: "PNG", exact: true }).click();
  await convert.getByRole("button", { name: "开始转换", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.convert.outcome?.converted : 0;
    })
    .toBe(1);
  const png = join(directory, "convert_output", "PDF转换", "page-1.png");
  expect((await stat(png)).size).toBeGreaterThan(0);
  await convert.getByRole("button", { name: "完成", exact: true }).click();

  await dropOnPet(pdfFixture, "convert");
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.convertOpen : false;
    })
    .toBe(true);
  await convert.getByRole("button", { name: "TXT", exact: true }).click();
  await convert.getByRole("button", { name: "开始转换", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.convert.outcome?.converted : 0;
    })
    .toBe(1);
  const text = await readFile(join(directory, "PDF转换.txt"), "utf8");
  expect(text).toContain("PDF page one");
  await convert.getByRole("button", { name: "完成", exact: true }).click();

  const documentFixture = join(directory, "文档转换.txt");
  await writeFile(documentFixture, "中文 PDF 测试\n第二行", "utf8");
  await dropOnPet(documentFixture, "convert");
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.convertOpen : false;
    })
    .toBe(true);
  await convert.getByRole("button", { name: "PDF", exact: true }).click();
  await convert.getByRole("button", { name: "开始转换", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.convert.outcome?.converted : 0;
    })
    .toBe(1);
  const documentPdf = await readFile(join(directory, "文档转换.pdf"));
  expect(documentPdf.subarray(0, 4).toString()).toBe("%PDF");
  await convert.getByRole("button", { name: "完成", exact: true }).click();

  const registered = await lab.evaluate(() => window.mqmz!.snapshot());
  if (registered.ok) {
    for (const file of registered.value.files.filter((item) =>
      ["PDF转换.pdf", "文档转换.txt"].includes(item.name),
    ))
      await lab.evaluate(
        (fileId) => window.mqmz!.command({ type: "remove-file", fileId }),
        file.id,
      );
  }
});

test("格式转换可以移除已添加的文件", async () => {
  const first = join(directory, "移除甲.png");
  const second = join(directory, "移除乙.png");
  for (const [path, color] of [
    [first, "#336699"],
    [second, "#993366"],
  ] as const) {
    await sharp({
      create: { width: 20, height: 20, channels: 3, background: color },
    })
      .png()
      .toFile(path);
  }
  await dropOnPet([first, second], "convert");
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.convertOpen : false;
    })
    .toBe(true);
  await expect(convert.locator(".convert-file")).toHaveCount(2);
  await convert.locator(".convert-file-remove").first().click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.convert.files.length : 0;
    })
    .toBe(1);
  await convert.locator(".convert-file-remove").first().click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.convertOpen : true;
    })
    .toBe(false);
  const registered = await lab.evaluate(() => window.mqmz!.snapshot());
  if (registered.ok) {
    for (const file of registered.value.files.filter((item) =>
      ["移除甲.png", "移除乙.png"].includes(item.name),
    ))
      await lab.evaluate(
        (fileId) => window.mqmz!.command({ type: "remove-file", fileId }),
        file.id,
      );
  }
});

test("合并 PDF 支持调整文件顺序", async () => {
  const first = join(directory, "合并甲.pdf");
  const second = join(directory, "合并乙.pdf");
  for (const [path, width] of [
    [first, 200],
    [second, 300],
  ] as const) {
    const document = await PDFDocument.create();
    document.addPage([width, width]);
    await writeFile(path, await document.save());
  }
  await dropOnPet([first, second], "convert");
  await expect(
    convert.getByRole("button", { name: "合并 PDF", exact: true }),
  ).toBeVisible();
  await expect(convert.locator(".convert-file").first()).toContainText(
    "合并甲.pdf",
  );
  await convert
    .getByRole("button", { name: "下移 合并甲.pdf", exact: true })
    .click();
  await expect(convert.locator(".convert-file").first()).toContainText(
    "合并乙.pdf",
  );
  await convert.getByRole("button", { name: "开始转换", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.convert.outcome?.converted : 0;
    })
    .toBe(1);
  const merged = await PDFDocument.load(
    await readFile(join(directory, "convert_output", "合并乙-合并.pdf")),
  );
  expect(merged.getPages().map((page) => page.getWidth())).toEqual([300, 200]);
  await convert.getByRole("button", { name: "完成", exact: true }).click();
});

test("视频转 MP3 复用转换成功面板", async () => {
  test.skip(process.platform === "win32", "fake FFmpeg 脚本仅在 POSIX 下可用");
  const fake = join(directory, "fake-ffmpeg-fast.sh");
  await writeFile(
    fake,
    `#!/bin/bash
if [[ " $* " == *" -version "* ]]; then echo "ffmpeg version 6.0"; exit 0; fi
if [[ " $* " != *" -progress "* ]]; then exit 0; fi
for last; do :; done
printf 'ID3 fake audio' > "$last"
echo "out_time_us=3000000"
exit 0
`,
    "utf8",
  );
  await chmod(fake, 0o755);
  await application.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [path],
    });
  }, fake);
  await pet.evaluate(() =>
    window.mqmz!.command({ type: "engine-use-local", id: "ffmpeg" }),
  );
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.engines.ffmpeg.origin : "none";
    })
    .toBe("local");
  const video = join(directory, "提取音轨.mp4");
  await writeFile(video, "fake video");
  await dropOnPet(video, "convert");
  await convert.getByRole("button", { name: "MP3", exact: true }).click();
  await convert.getByRole("button", { name: "开始转换", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.convert.outcome?.converted : 0;
    })
    .toBe(1);
  await expect(convert.locator(".convert-result")).toContainText("已转换 1 个");
  await expect(convert.locator(".convert-preview")).toHaveCount(1);
  await expect(
    convert.getByRole("button", { name: "打开所在位置", exact: true }),
  ).toBeVisible();
  expect(await readFile(join(directory, "提取音轨.mp3"), "utf8")).toBe(
    "ID3 fake audio",
  );
  await convert.getByRole("button", { name: "完成", exact: true }).click();
});

test("取消转换停止子进程并清理临时文件", async () => {
  test.skip(process.platform === "win32", "fake FFmpeg 脚本仅在 POSIX 下可用");
  const marker = join(directory, "slow-ffmpeg-finished");
  const fake = join(directory, "fake-ffmpeg-slow.sh");
  await writeFile(
    fake,
    `#!/bin/bash
if [[ " $* " == *" -version "* ]]; then echo "ffmpeg version 6.0"; exit 0; fi
if [[ " $* " != *" -progress "* ]]; then exit 0; fi
for last; do :; done
printf 'partial' > "$last"
sleep 5
touch "${marker}"
exit 0
`,
    "utf8",
  );
  await chmod(fake, 0o755);
  await application.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [path],
    });
  }, fake);
  await pet.evaluate(() =>
    window.mqmz!.command({ type: "engine-use-local", id: "ffmpeg" }),
  );
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.engines.ffmpeg.origin : "none";
    })
    .toBe("local");
  const video = join(directory, "取消长视频.mp4");
  await writeFile(video, "fake video");
  await dropOnPet(video, "convert");
  await convert.getByRole("button", { name: "WEBM", exact: true }).click();
  await convert.getByRole("button", { name: "开始转换", exact: true }).click();
  await expect(
    convert.getByRole("button", { name: "取消转换", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      (await readdir(directory)).some((name) => name.startsWith(".mqmz-")),
    )
    .toBe(true);
  await convert.getByRole("button", { name: "取消转换", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.convert.busy : true;
    })
    .toBe(false);
  await expect(
    convert.getByRole("button", { name: "开始转换", exact: true }),
  ).toBeVisible();
  await expect(convert.locator(".convert-notice")).toContainText("已取消转换");
  expect((await readdir(directory)).some((name) => name.startsWith(".mqmz-"))).toBe(
    false,
  );
  expect((await readdir(directory)).includes("取消长视频.webm")).toBe(false);
  await convert.waitForTimeout(5500);
  expect((await readdir(directory)).includes("slow-ffmpeg-finished")).toBe(false);
  await convert.evaluate(() =>
    window.mqmz!.command({ type: "convert-close" }),
  );
});

test("批量转换部分失败时保留成功结果", async () => {
  const good = join(directory, "部分成功.png");
  const broken = join(directory, "损坏图片.png");
  await sharp({
    create: {
      width: 40,
      height: 40,
      channels: 3,
      background: "#227755",
    },
  })
    .png()
    .toFile(good);
  await writeFile(broken, "not an image");
  await dropOnPet([good, broken], "convert");
  await convert.getByRole("button", { name: "PDF", exact: true }).click();
  await convert.getByRole("button", { name: "开始转换", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.convert.outcome?.converted : 0;
    })
    .toBe(1);
  await expect(convert.locator(".convert-result")).toContainText("已转换 1 个");
  await expect(convert.locator(".convert-result")).toContainText("失败 1 个");
  await expect(convert.locator(".convert-errors")).toContainText(
    "不是有效的图片",
  );
  expect((await readdir(join(directory, "convert_output"))).includes("部分成功.pdf")).toBe(true);
  await convert.getByRole("button", { name: "完成", exact: true }).click();
});

test("透明图片转 JPG 使用白色背景", async () => {
  const source = join(directory, "透明图.png");
  await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toFile(source);
  await dropOnPet(source, "convert");
  await convert.getByRole("button", { name: "JPG", exact: true }).click();
  await convert.getByRole("button", { name: "开始转换", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.convert.outcome?.converted : 0;
    })
    .toBe(1);
  const stats = await sharp(join(directory, "透明图.jpg")).stats();
  for (const channel of stats.channels) expect(channel.mean).toBeGreaterThan(254);
  await convert.getByRole("button", { name: "完成", exact: true }).click();
});

test("qpdf 可以加密并解除 PDF 密码", async () => {
  const qpdf = resolve(
    "resources",
    "engines",
    "qpdf",
    `${process.platform}-${process.arch}`,
    process.platform === "win32" ? "qpdf.exe" : "bin/qpdf",
  );
  const qpdfEnv = {
    ...process.env,
    ...(process.platform === "darwin"
      ? {
          DYLD_LIBRARY_PATH: join(
            resolve(
              "resources",
              "engines",
              "qpdf",
              `${process.platform}-${process.arch}`,
            ),
            "lib",
          ),
        }
      : {}),
  };
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.engines.builtin.qpdf?.status : "missing";
    })
    .toBe("ready");
  const source = join(directory, "qpdf加密.pdf");
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  document
    .addPage([300, 200])
    .drawText("confidential", { x: 30, y: 100, size: 18, font });
  await writeFile(source, await document.save());
  await dropOnPet(source, "convert");
  await convert.getByRole("button", { name: "加密 PDF", exact: true }).click();
  await convert.locator(".convert-password input").fill("secret123");
  await convert.getByRole("button", { name: "开始转换", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.convert.outcome?.converted : 0;
    })
    .toBe(1);
  const encrypted = join(directory, "qpdf加密-加密.pdf");
  const encryptedInfo = await promisify(execFile)(
    qpdf,
    ["--password=secret123", "--show-encryption", encrypted],
    { env: qpdfEnv },
  );
  expect(encryptedInfo.stdout).toContain("R = 6");
  await convert.getByRole("button", { name: "完成", exact: true }).click();

  await dropOnPet(encrypted, "convert");
  await convert.getByRole("button", { name: "解除密码", exact: true }).click();
  await convert.locator(".convert-password input").fill("wrong");
  await convert.getByRole("button", { name: "开始转换", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.convert.outcome?.failed : 0;
    })
    .toBe(1);
  await expect(convert.locator(".convert-errors")).toContainText(
    "PDF 密码不正确",
  );
  await convert.getByRole("button", { name: "完成", exact: true }).click();

  await dropOnPet(encrypted, "convert");
  await convert.getByRole("button", { name: "解除密码", exact: true }).click();
  await convert.locator(".convert-password input").fill("secret123");
  await convert.getByRole("button", { name: "开始转换", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.convert.outcome?.converted : 0;
    })
    .toBe(1);
  const decryptedInfo = await promisify(execFile)(
    qpdf,
    ["--show-encryption", join(directory, "qpdf加密-加密-解密.pdf")],
    { env: qpdfEnv },
  );
  expect(decryptedInfo.stdout).toContain("File is not encrypted");
  await convert.getByRole("button", { name: "完成", exact: true }).click();
});

test("设置显示内置引擎状态与可选引擎卸载入口", async () => {
  test.skip(process.platform === "win32", "fake FFmpeg 脚本仅在 POSIX 下可用");
  const fake = join(directory, "settings-ffmpeg.sh");
  await writeFile(
    fake,
    '#!/bin/bash\nif [[ " $* " == *" -version "* ]]; then echo "ffmpeg version 6.0"; exit 0; fi\nexit 0\n',
    "utf8",
  );
  await chmod(fake, 0o755);
  await application.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [path],
    });
  }, fake);
  await pet.evaluate(() =>
    window.mqmz!.command({ type: "engine-use-local", id: "ffmpeg" }),
  );
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.engines.ffmpeg.origin : "none";
    })
    .toBe("local");
  await pet.evaluate(() =>
    window.mqmz!.command({ type: "settings-open" }),
  );
  await pet.evaluate(() =>
    window.mqmz!.command({ type: "settings-section", section: "conversion" }),
  );
  await expect(
    settings.locator(".engine-card", { hasText: "sharp" }),
  ).toContainText("可用");
  await expect(
    settings
      .locator(".engine-card", { hasText: "FFmpeg" })
      .getByRole("button", { name: "卸载", exact: true }),
  ).toBeVisible();
  await expect(
    settings.locator(".engine-card", { hasText: "qpdf" }),
  ).toContainText("可用");
  await pet.evaluate(() =>
    window.mqmz!.command({ type: "settings-close" }),
  );
});

test("邮件客户端设置可添加账户并调整偏好", async () => {
  await pet.evaluate(() =>
    window.mqmz!.command({ type: "settings-open" }),
  );
  await pet.evaluate(() =>
    window.mqmz!.command({ type: "settings-section", section: "mail" }),
  );
  await expect(settings.locator(".settings-group-title")).toHaveCount(0);
  await expect(settings.locator(".mail-row .mail-label")).toHaveText([
    "邮箱账户",
    "同步间隔",
    "新邮件通知",
    "未读角标",
    "附件保存目录",
    "缓存保留",
  ]);
  await expect(
    settings
      .locator(".mail-row", { hasText: "附件保存目录" })
      .getByRole("button"),
  ).toHaveText(["选择", "打开"]);
  await expect(settings.locator(".mail-switch").first()).toHaveCSS(
    "height",
    "22px",
  );
  await settings
    .locator(".mail-row", { hasText: "邮箱账户" })
    .getByRole("button", { name: "添加", exact: true })
    .click();
  await expect(settings.locator(".mail-provider-track")).toBeVisible();
  await expect(settings.locator(".mail-provider-thumb")).toBeVisible();
  await expect(settings.locator(".mail-provider")).toHaveCount(3);
  await expect(settings.locator(".mail-provider")).toHaveText([
    "QQ 邮箱",
    "网易邮箱",
    "Gmail",
  ]);
  await expect(
    settings
      .locator(".mail-row", { hasText: "邮箱账户" })
      .getByRole("button", { name: "添加", exact: true }),
  ).toHaveCount(0);
  await settings.locator(".mail-provider", { hasText: "网易邮箱" }).click();
  await expect(settings.locator(".mail-field input").first()).toHaveAttribute(
    "placeholder",
    "name@126.com 或 name@163.com",
  );
  await expect(settings.locator(".mail-field span")).toHaveText([
    "邮箱地址",
    "授权码 / 应用专用密码",
    "显示名称",
  ]);
  await expect(
    settings.getByRole("button", { name: "取消", exact: true }),
  ).toHaveCSS("height", "28px");
  const submitButton = settings.getByRole("button", {
    name: "测试并添加",
    exact: true,
  });
  await expect(submitButton).toHaveCSS("height", "28px");
  await expect(submitButton).toHaveCSS("font-size", "12px");
  await expect(submitButton).toHaveCSS("font-weight", "600");
  await settings
    .getByRole("button", { name: "测试并添加", exact: true })
    .click();
  await expect(settings.locator(".toast-item.toast-error")).toContainText(
    "请填写邮箱地址和授权码",
  );
  await settings.locator(".mail-form").getByRole("button", { name: "取消", exact: true }).click();
  await expect(settings.locator(".mail-form")).toHaveCount(0);
  await expect(
    settings
      .locator(".mail-row", { hasText: "邮箱账户" })
      .getByRole("button", { name: "添加", exact: true }),
  ).toBeVisible();

  await settings
    .locator(".mail-row", { hasText: "同步间隔" })
    .locator("select")
    .selectOption("30");
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.mail.config.syncMinutes : 0;
    })
    .toBe(30);
  await settings
    .locator(".mail-row", { hasText: "同步间隔" })
    .locator("select")
    .selectOption("45");
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.mail.config.syncMinutes : 0;
    })
    .toBe(45);
  await settings
    .locator(".mail-row", { hasText: "新邮件通知" })
    .locator(".mail-switch")
    .click();
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.mail.config.notify : true;
    })
    .toBe(false);
  await pet.evaluate(() =>
    window.mqmz!.command({ type: "settings-close" }),
  );
});

test("打包归档、解压缩与压缩大小 work on real files", async () => {
  const first = join(directory, "归档甲.txt");
  const second = join(directory, "归档乙.txt");
  await writeFile(first, "alpha");
  await writeFile(second, "beta");
  await dropOnPet([first, second], "archive");
  await expect
    .poll(async () => (await readdir(directory)).find((name) => name.endsWith(".zip")))
    .toBeTruthy();
  const zipName = (await readdir(directory)).find((name) => name.endsWith(".zip"))!;
  const zipPath = join(directory, zipName);
  const entries = unzipSync(new Uint8Array(await readFile(zipPath)));
  expect(Object.keys(entries).sort()).toEqual(["归档乙.txt", "归档甲.txt"]);
  expect(new TextDecoder().decode(entries["归档甲.txt"])).toBe("alpha");

  await dropOnPet(zipPath, "extract");
  const folder = join(directory, zipName.replace(/\.zip$/i, ""));
  await expect
    .poll(async () => {
      try {
        return (await readdir(folder)).sort();
      } catch {
        return [];
      }
    })
    .toEqual(["归档乙.txt", "归档甲.txt"]);
  expect(await readFile(join(folder, "归档乙.txt"), "utf8")).toBe("beta");

  const image = join(directory, "压缩样张.png");
  await sharp({
    create: {
      width: 1200,
      height: 900,
      channels: 3,
      background: { r: 120, g: 80, b: 60 },
    },
  })
    .png({ compressionLevel: 0 })
    .toFile(image);
  await dropOnPet(image, "shrink");
  await expect
    .poll(async () => (await readdir(directory)).find((name) => name.includes("-压缩")))
    .toBeTruthy();
  const compressed = (await readdir(directory)).find((name) =>
    name.includes("-压缩"),
  )!;
  const meta = await sharp(join(directory, compressed)).metadata();
  expect(meta.width).toBe(1200);
  expect(meta.height).toBe(900);

  const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
  for (const file of snapshot.ok ? snapshot.value.files : [])
    await lab.evaluate(
      (fileId) => window.mqmz!.command({ type: "remove-file", fileId }),
      file.id,
    );
});

test("dropping two files on 批量重命名 renames them with a format", async () => {
  const first = join(directory, "甲文件.txt");
  const second = join(directory, "乙文件.txt");
  await writeFile(first, "alpha");
  await writeFile(second, "beta");
  await pet.evaluate(() => {
    document.querySelector("#rename-input")?.remove();
    const input = document.createElement("input");
    input.type = "file";
    input.id = "rename-input";
    input.multiple = true;
    input.hidden = true;
    document.body.append(input);
  });
  await pet.locator("#rename-input").setInputFiles([first, second]);
  await pet.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>("#rename-input")!;
    const transfer = new DataTransfer();
    for (const file of input.files!) transfer.items.add(file);
    document.querySelector(".pet-surface")!.dispatchEvent(
      new DragEvent("dragenter", {
        dataTransfer: transfer,
        bubbles: true,
        cancelable: true,
        clientX: 2,
        clientY: 2,
      }),
    );
  });
  await expect(pet.locator(".donut-ring")).toBeVisible();
  await pet.waitForTimeout(360);
  const box = await pet.locator(".marker").boundingBox();
  if (!box) throw new Error("Marker is not rendered");
  const point = pointOnSlice(
    "rename",
    box.x + box.width / 2,
    box.y + box.height / 2,
  );
  await pet.evaluate(({ x, y }) => {
    const input = document.querySelector<HTMLInputElement>("#rename-input")!;
    const transfer = new DataTransfer();
    for (const file of input.files!) transfer.items.add(file);
    const surface = document.querySelector(".pet-surface")!;
    surface.dispatchEvent(
      new DragEvent("dragover", {
        dataTransfer: transfer,
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      }),
    );
    surface.dispatchEvent(
      new DragEvent("drop", {
        dataTransfer: transfer,
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      }),
    );
  }, point);
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.renameOpen : false;
    })
    .toBe(true);
  await expect(
    rename.getByRole("heading", { name: "批量重命名", exact: true }),
  ).toBeVisible();
  await rename.getByRole("button", { name: "格式", exact: true }).click();
  await rename.getByRole("button", { name: "重命名", exact: true }).click();
  await expect
    .poll(async () => {
      const files = await readdir(directory);
      return files.includes("文件1.txt") && files.includes("文件2.txt");
    })
    .toBe(true);
  const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
  for (const file of snapshot.ok ? snapshot.value.files : [])
    await lab.evaluate(
      (fileId) => window.mqmz!.command({ type: "remove-file", fileId }),
      file.id,
    );
});

test("the donut closes when a drag ends without a drop", async () => {
  await pet.evaluate(() => {
    document.querySelector("#mqmz-stuck-input")?.remove();
    const input = document.createElement("input");
    input.type = "file";
    input.id = "mqmz-stuck-input";
    input.hidden = true;
    document.body.append(input);
  });
  const fixture = join(directory, "拖回桌面.txt");
  await writeFile(fixture, "left-on-desktop");
  await pet.locator("#mqmz-stuck-input").setInputFiles(fixture);
  await pet.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>("#mqmz-stuck-input")!;
    const transfer = new DataTransfer();
    for (const file of input.files!) transfer.items.add(file);
    document.querySelector(".pet-surface")!.dispatchEvent(
      new DragEvent("dragenter", {
        dataTransfer: transfer,
        bubbles: true,
        cancelable: true,
        clientX: 2,
        clientY: 2,
      }),
    );
  });
  await expect(pet.locator(".donut-ring")).toBeVisible();
  // No further dragover/drop: the drag ended on the desktop.
  await expect(pet.locator(".donut-ring")).toHaveCount(0, { timeout: 4000 });
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok
        ? `${snapshot.value.wheelOpen}:${snapshot.value.dropMode}:${snapshot.value.petBounds.width}`
        : "";
    })
    .toBe("false:false:132");
  const state = await lab.evaluate(() => window.mqmz!.snapshot());
  expect(state.ok && state.value.files.length).toBe(0);
  expect(await readFile(fixture, "utf8")).toBe("left-on-desktop");
  await pet
    .locator("#mqmz-stuck-input")
    .evaluate((element) => element.remove());
});

test("canceling a file drag restores the hover wheel", async () => {
  await pet.evaluate(() => {
    document.querySelector("#mqmz-cancel-drag-input")?.remove();
    const input = document.createElement("input");
    input.type = "file";
    input.id = "mqmz-cancel-drag-input";
    input.hidden = true;
    document.body.append(input);
  });
  const fixture = join(directory, "取消拖拽.txt");
  await writeFile(fixture, "cancel-drag");
  await pet
    .locator("#mqmz-cancel-drag-input")
    .setInputFiles(fixture);
  await pet.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>(
      "#mqmz-cancel-drag-input",
    )!;
    const transfer = new DataTransfer();
    for (const file of input.files!) transfer.items.add(file);
    document.querySelector(".pet-surface")!.dispatchEvent(
      new DragEvent("dragenter", {
        dataTransfer: transfer,
        bubbles: true,
        cancelable: true,
        clientX: 2,
        clientY: 2,
      }),
    );
  });
  await pet.keyboard.press("Escape");
  await expect(pet.locator(".donut-ring")).toHaveCount(0, { timeout: 4000 });
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok
        ? `${snapshot.value.wheelOpen}:${snapshot.value.dropMode}`
        : "";
    })
    .toBe("false:false");

  const box = await pet.locator(".marker").boundingBox();
  if (!box) throw new Error("Marker is not rendered");
  await pet.mouse.move(4, 4);
  await new Promise((resolve) => setTimeout(resolve, 160));
  await pet.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(pet.locator(".donut-ring")).toBeVisible({ timeout: 3000 });
  await expect(pet.locator(".donut-segment")).toHaveCount(hoverActions.length);
  await pet.keyboard.press("Escape");
  await pet
    .locator("#mqmz-cancel-drag-input")
    .evaluate((element) => element.remove());
});

test("releasing on the pet cancels instead of acting", async () => {
  const fixture = join(directory, "中心取消.txt");
  await writeFile(fixture, "cancel-me");
  await dropOnPet(fixture, "center");
  const state = await lab.evaluate(() => window.mqmz!.snapshot());
  expect(state.ok && state.value.files.length).toBe(0);
  expect(state.ok && state.value.belly.length).toBe(0);
  expect(await readFile(fixture, "utf8")).toBe("cancel-me");
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.petBounds.width : 0;
    })
    .toBe(132);
});

test("dropping on 置物架 opens the shelf with the received file", async () => {
  const fixture = join(directory, "轮盘暂存.txt");
  await writeFile(fixture, "donut-stash");
  await pet.evaluate(() => window.mqmz!.command({ type: "hide-pocket" }));
  await expect
    .poll(() =>
      application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((window) => window.getTitle().includes("文件置物架"))!
          .isVisible(),
      ),
    )
    .toBe(false);
  await dropOnPet(fixture, "stash");
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.files[0]?.status : undefined;
    })
    .toBe("shelved");
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok
        ? `${snapshot.value.wheelOpen}:${snapshot.value.petBounds.width}`
        : "";
    })
    .toBe("false:132");
  expect(
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.getTitle().includes("文件置物架"))!
        .isVisible(),
    ),
  ).toBe(true);
  await expect(
    pocket.getByRole("button", { name: "移出置物架", exact: true }),
  ).toBeVisible();
  await pocket.getByRole("button", { name: "移出置物架", exact: true }).click();
});

test("dropping on 吃掉 eats the file into a reversible belly", async () => {
  const fixture = join(directory, "被吃掉.txt");
  await writeFile(fixture, "eaten-bytes");
  await dropOnPet(fixture, "eat");
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.toast ?? "" : "";
    })
    .toContain("7 天内");
  await expect
    .poll(async () => {
      try {
        await readFile(fixture);
        return true;
      } catch {
        return false;
      }
    })
    .toBe(false);
  const eaten = await lab.evaluate(() => window.mqmz!.snapshot());
  expect(eaten.ok && eaten.value.belly.length).toBe(1);
  expect(eaten.ok && eaten.value.belly[0].name).toBe("被吃掉.txt");
  expect(JSON.stringify(eaten)).not.toContain(directory);
  await pet.evaluate(() => window.mqmz!.command({ type: "show-pocket" }));
  await expect(pocket.getByText("肚子里的", { exact: true })).toBeVisible();
  await pocket.getByRole("button", { name: "取回", exact: true }).click();
  await expect
    .poll(async () => {
      try {
        return await readFile(fixture, "utf8");
      } catch {
        return "";
      }
    })
    .toBe("eaten-bytes");
  const restored = await lab.evaluate(() => window.mqmz!.snapshot());
  expect(restored.ok && restored.value.belly.length).toBe(0);
  await pet.evaluate(() => window.mqmz!.command({ type: "hide-pocket" }));
});

test("dropping a non-ZIP on 解压缩 reports a clear error", async () => {
  const fixture = join(directory, "不是压缩包.txt");
  await writeFile(fixture, "not-a-zip");
  await dropOnPet(fixture, "extract");
  await expect(pet.locator(".pet-error")).toContainText(
    "目前支持 ZIP、7Z 和 RAR 压缩包",
  );
  const state = await lab.evaluate(() => window.mqmz!.snapshot());
  expect(state.ok && state.value.files.length).toBe(1);
  if (state.ok)
    for (const file of state.value.files)
      await lab.evaluate(
        (fileId) => window.mqmz!.command({ type: "remove-file", fileId }),
        file.id,
      );
  expect(await readFile(fixture, "utf8")).toBe("not-a-zip");
});

test("dropping outside the ring leaves the file untouched", async () => {
  const fixture = join(directory, "环外.txt");
  await writeFile(fixture, "outside-ring");
  await dropOnPet(fixture, "outside");
  const state = await lab.evaluate(() => window.mqmz!.snapshot());
  expect(state.ok && state.value.files.length).toBe(0);
  expect(state.ok && state.value.belly.length).toBe(0);
  expect(await readFile(fixture, "utf8")).toBe("outside-ring");
});

test("saving a real copy preserves the original and refuses to overwrite it", async () => {
  const fixture = join(directory, "原件保留.txt");
  const destination = join(directory, "另存副本.txt");
  await writeFile(fixture, "preserve-original-bytes");
  await pocket.evaluate(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.id = "mqmz-copy-input";
    input.hidden = true;
    document.body.append(input);
  });
  await pocket.locator("#mqmz-copy-input").setInputFiles(fixture);
  await pocket
    .locator("#mqmz-copy-input")
    .evaluate((element) =>
      window.mqmz!.receiveFiles([...(element as HTMLInputElement).files!]),
    );
  await application.evaluate(({ dialog }) => {
    (
      globalThis as unknown as { mqmzSaveDialog: typeof dialog.showSaveDialog }
    ).mqmzSaveDialog = dialog.showSaveDialog;
  });
  try {
    // Only the native picker selection is injected; all filesystem operations run for real.
    await application.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, fixture);
    await pocket.getByRole("button", { name: "另存副本", exact: true }).click();
    await expect(pocket.getByRole("alert")).toContainText("不同的保存位置");
    await application.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, destination);
    await pocket.getByRole("button", { name: "另存副本", exact: true }).click();
    await expect
      .poll(async () => {
        try {
          return await readFile(destination, "utf8");
        } catch {
          return "";
        }
      })
      .toBe("preserve-original-bytes");
    expect(await readFile(fixture, "utf8")).toBe("preserve-original-bytes");
    await pocket.getByRole("button", { name: "移出置物架", exact: true }).click();
  } finally {
    await application.evaluate(({ dialog }) => {
      dialog.showSaveDialog = (
        globalThis as unknown as {
          mqmzSaveDialog: typeof dialog.showSaveDialog;
        }
      ).mqmzSaveDialog;
    });
  }
});

test("forged files, malformed commands, and privileged commands from the pet are rejected", async () => {
  const forged = await lab.evaluate(() =>
    window.mqmz!.receiveFiles([new File(["data"], "pretend.txt")]),
  );
  expect(forged.ok).toBe(false);
  const invalid = await lab.evaluate(() =>
    window.mqmz!.command({ type: "scale", scale: 1000 }),
  );
  expect(invalid.ok).toBe(false);
  const wrongRole = await pet.evaluate(() =>
    window.mqmz!.command({ type: "recover" }),
  );
  expect(wrongRole.ok).toBe(false);
  await expect(lab.getByTestId("file-row")).toHaveCount(0);
});

test("missing source files fail safely without removing the registry or leaking paths", async () => {
  const fixture = join(directory, "will-be-removed.txt");
  await writeFile(fixture, "original");
  await lab.evaluate(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.id = "mqmz-test-missing";
    input.hidden = true;
    document.body.append(input);
  });
  await lab.locator("#mqmz-test-missing").setInputFiles(fixture);
  const result = await lab
    .locator("#mqmz-test-missing")
    .evaluate((element) =>
      window.mqmz!.receiveFiles([...(element as HTMLInputElement).files!]),
    );
  expect(result.ok).toBe(true);
  await rm(fixture);
  await lab.getByRole("button", { name: "定位 will-be-removed.txt" }).click();
  await expect(lab.getByRole("alert")).toContainText("本地操作失败");
  expect(await lab.getByRole("alert").innerText()).not.toContain(directory);
  await lab
    .getByRole("button", { name: "移除 will-be-removed.txt 的记录" })
    .click();
});

test("the display recovery command constrains the native window and persists the position", async () => {
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.getTitle().includes("交互标记"))!
      .setPosition(-20000, -20000),
  );
  await lab.getByRole("button", { name: "恢复标记位置", exact: true }).click();
  const current = await lab.evaluate(() => window.mqmz!.snapshot());
  expect(current.ok).toBe(true);
  if (!current.ok) return;
  const bounds = current.value.petBounds;
  expect(
    current.value.displays.some(
      (d) =>
        bounds.x >= d.workArea.x &&
        bounds.y >= d.workArea.y &&
        bounds.x + bounds.width <= d.workArea.x + d.workArea.width &&
        bounds.y + bounds.height <= d.workArea.y + d.workArea.height,
    ),
  ).toBe(true);
  await expect
    .poll(
      async () =>
        JSON.parse(
          await readFile(
            join(directory, "data", "mqmz.window-state.json"),
            "utf8",
          ),
        ).bounds,
    )
    .toEqual(bounds);
});

test("the real marker moves across every detected display including negative origins", async () => {
  const before = await lab.evaluate(() => window.mqmz!.snapshot());
  if (!before.ok) throw new Error(before.error);
  for (const display of before.value.displays) {
    const result = await lab.evaluate(
      (id) => window.mqmz!.command({ type: "move-display", displayId: id }),
      display.id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) continue;
    const b = result.value.petBounds;
    expect(b.x).toBeGreaterThanOrEqual(display.workArea.x);
    expect(b.y).toBeGreaterThanOrEqual(display.workArea.y);
    expect(b.x + b.width).toBeLessThanOrEqual(
      display.workArea.x + display.workArea.width,
    );
    expect(b.y + b.height).toBeLessThanOrEqual(
      display.workArea.y + display.workArea.height,
    );
    const actual = await application.evaluate(({ BrowserWindow, screen }) => {
      const bounds = BrowserWindow.getAllWindows()
        .find((w) => w.getTitle().includes("交互标记"))!
        .getBounds();
      return screen.getDisplayMatching(bounds).id;
    });
    expect(actual).toBe(display.id);
  }
  await lab.getByRole("button", { name: "恢复标记位置", exact: true }).click();
});

test("native capture permission is read without requesting capture, and narrow layouts stay usable", async () => {
  const state = await lab.evaluate(() => window.mqmz!.snapshot());
  expect(state.ok && state.value.screenPermission.length > 0).toBe(true);
  await expect(lab.getByTestId("screen-permission")).not.toHaveText("读取中");
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.getTitle().includes("验证台"))!
      .setSize(720, 680),
  );
  await expect.poll(() => lab.evaluate(() => innerWidth)).toBe(720);
  expect(
    await lab.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await lab.screenshot({ path: "/tmp/mqmz-p0-lab-narrow.png" });
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.getTitle().includes("验证台"))!
      .setSize(1024, 800),
  );
  expect(runtimeErrors).toEqual([]);
  await writeFile("/tmp/mqmz-p0-runtime.json", JSON.stringify(state, null, 2));
});

test("an explicit preview request captures actual screens when permission is already granted", async () => {
  const state = await lab.evaluate(() => window.mqmz!.snapshot());
  test.skip(
    !state.ok || state.value.screenPermission !== "granted",
    "OS permission is not pre-granted; do not automate permission changes.",
  );
  await lab.getByRole("button", { name: "获取权限验证预览" }).click();
  await expect
    .poll(() => lab.locator(".previews img").count())
    .toBeGreaterThan(0);
  const previews = await lab.locator(".previews img").evaluateAll((images) =>
    images.map((image) => ({
      loaded: (image as HTMLImageElement).naturalWidth > 0,
      png: (image as HTMLImageElement).src.startsWith("data:image/png;base64,"),
    })),
  );
  expect(previews.every((preview) => preview.loaded && preview.png)).toBe(true);
  // Do not write screen contents to disk, logs, screenshots, or repository artifacts.
  await writeFile(
    "/tmp/mqmz-p0-capture-result.json",
    JSON.stringify({
      previewCount: previews.length,
      permission: "granted",
      persisted: false,
    }),
  );
  expect(runtimeErrors).toEqual([]);
});

test("closing the wheel after a helper window is destroyed does not throw", async () => {
  await application.evaluate(() => {
    const store = globalThis as unknown as { mqmzUncaught?: string[] };
    store.mqmzUncaught = [];
    process.on("uncaughtException", (error) => {
      store.mqmzUncaught!.push(String(error));
    });
  });
  await pet.evaluate(() => window.mqmz!.command({ type: "wheel", open: true }));
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((window) => window.getTitle().includes("文件转换"))!
      .destroy(),
  );
  const result = await pet.evaluate(() =>
    window.mqmz!.command({ type: "wheel", open: false }),
  );
  expect(result.ok).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const errors = await application.evaluate(
    () =>
      (
        globalThis as unknown as { mqmzUncaught?: string[] }
      ).mqmzUncaught ?? [],
  );
  expect(errors).toEqual([]);
});

test("receiving persists a local index across restart and removing the card preserves the original", async () => {
  const fixture = join(directory, "重启后仍保留.txt");
  await writeFile(fixture, "persistent-original");
  await pocket.evaluate(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.id = "mqmz-persist-input";
    input.hidden = true;
    document.body.append(input);
  });
  await pocket.locator("#mqmz-persist-input").setInputFiles(fixture);
  await pocket
    .locator("#mqmz-persist-input")
    .evaluate((element) =>
      window.mqmz!.receiveFiles([...(element as HTMLInputElement).files!]),
    );
  const stored = JSON.parse(
    await readFile(join(directory, "data", "mqmz.file-shelf.json"), "utf8"),
  );
  expect(stored.files[0].path).toBe(await realpath(fixture));
  await application.close();
  application = await electron.launch({
    args: [resolve(".")],
    env: launchEnvironment,
  });
  await expect.poll(() => application.windows().length).toBe(22);
  pocket = (
    await Promise.all(
      application
        .windows()
        .map(async (page) => ({ page, title: await page.title() })),
    )
  ).find((item) => item.title.includes("文件置物架"))!.page;
  await pocket.evaluate(() => window.mqmz!.command({ type: "show-pocket" }));
  await expect(
    pocket.getByRole("button", { name: "文件 重启后仍保留.txt", exact: true }),
  ).toBeVisible();
  await expect(
    pocket.getByRole("button", { name: "移出置物架", exact: true }),
  ).toBeVisible();
  await pocket.getByRole("button", { name: "移出置物架", exact: true }).click();
  expect(await readFile(fixture, "utf8")).toBe("persistent-original");
  expect(
    JSON.parse(
      await readFile(join(directory, "data", "mqmz.file-shelf.json"), "utf8"),
    ).files,
  ).toEqual([]);
  await pocket.screenshot({
    path: "/tmp/mqmz-file-pocket-empty.png",
    omitBackground: true,
  });
});

test("settings persist across restart", async () => {
  const windows = await Promise.all(
    application
      .windows()
      .map(async (page) => ({ page, title: await page.title() })),
  );
  const currentPet = windows.find((item) => item.title.includes("交互标记"))!.page;
  await currentPet.evaluate(() =>
    window.mqmz!.command({
      type: "settings-update",
      patch: { theme: "christmas", scale: 1.5 },
    }),
  );
  await application.close();
  application = await electron.launch({
    args: [resolve(".")],
    env: launchEnvironment,
  });
  await expect.poll(() => application.windows().length).toBe(22);
  const restarted = await Promise.all(
    application
      .windows()
      .map(async (page) => ({ page, title: await page.title() })),
  );
  const petPage = restarted.find((item) => item.title.includes("交互标记"))!.page;
  const settingsPage = restarted.find((item) => item.title.includes("设置"))!.page;
  await petPage.evaluate(() => window.mqmz!.command({ type: "settings-open" }));
  await expect(
    settingsPage.getByRole("heading", { name: "设置", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      petPage.evaluate(() =>
        document.documentElement.classList.contains("theme-christmas"),
      ),
    )
    .toBe(true);
  await expect
    .poll(async () => {
      const snapshot = await petPage.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.petBounds.width : 0;
    })
    .toBe(198);
  await settingsPage.evaluate(() =>
    window.mqmz!.command({
      type: "settings-update",
      patch: { theme: "default", scale: 1 },
    }),
  );
});

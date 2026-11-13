import { _electron as electron, expect, test } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { waitForAppWindows } from "./app-windows";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

let application: ElectronApplication;
let pet: Page;
let todo: Page;
let directory: string;
let data: string;
let validShelfPath: string;
let pinnedClipboardId: string;
let freshClipboardId: string;

function focusFile(todoDueAt: number, overdueAt: number): unknown {
  const now = Date.now();
  return {
    version: 5,
    phase: "focus",
    running: true,
    endsAt: now + 10 * 60_000,
    remaining: 600,
    completed: 0,
    focusMinutes: 25,
    shortMinutes: 5,
    longMinutes: 15,
    focusSeconds: 0,
    shortSeconds: 0,
    longSeconds: 0,
    water: true,
    waterInterval: 60,
    waterStart: 9,
    waterEnd: 22,
    waterNextAt: now - 60_000,
    waterGoal: 8,
    breakSitting: true,
    breakSittingInterval: 45,
    breakSittingNextAt: now - 60_000,
    breakEyes: false,
    breakEyesInterval: 20,
    breakEyesNextAt: null,
    breakDnd: false,
    breakDndStart: 22,
    breakDndEnd: 8,
    todos: [
      {
        id: randomUUID(),
        text: "旧逾期任务",
        done: false,
        listId: null,
        dueAt: overdueAt,
        urgent: false,
        flagged: false,
        notes: "",
        tags: [],
        repeat: "none",
        repeatFromId: null,
      },
      {
        id: randomUUID(),
        text: "即将到期任务",
        done: false,
        listId: null,
        dueAt: todoDueAt,
        urgent: false,
        flagged: false,
        notes: "",
        tags: [],
        repeat: "none",
        repeatFromId: null,
      },
    ],
    todoLists: [],
    todoGroups: [],
    todoTags: [],
    sessions: [],
    waterLog: [],
  };
}

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "mqmz-recovery-"));
  data = join(directory, "data");
  const shots = join(directory, "shots");
  const codexHome = join(directory, "codex-empty");
  await mkdir(data, { recursive: true });
  await mkdir(shots, { recursive: true });
  await mkdir(codexHome, { recursive: true });
  const now = Date.now();

  await writeFile(
    join(data, "mqmz.focus.json"),
    JSON.stringify(focusFile(now + 2_000, now - 10 * 60_000)),
    "utf8",
  );

  pinnedClipboardId = randomUUID();
  freshClipboardId = randomUUID();
  await writeFile(
    join(data, "mqmz.clipboard.json"),
    JSON.stringify({
      version: 1,
      config: {
        enabled: true,
        maxItems: 100,
        retentionDays: 30,
        ignoreSensitive: true,
      },
      entries: [
        {
          id: pinnedClipboardId,
          kind: "text",
          text: "固定记录",
          thumbnail: "",
          imagePath: null,
          hash: "pinned-old",
          createdAt: now - 90 * 86_400_000,
          pinned: true,
        },
        {
          id: randomUUID(),
          kind: "text",
          text: "过期未固定记录",
          thumbnail: "",
          imagePath: null,
          hash: "old-unpinned",
          createdAt: now - 90 * 86_400_000,
          pinned: false,
        },
        {
          id: freshClipboardId,
          kind: "text",
          text: "近期记录",
          thumbnail: "",
          imagePath: null,
          hash: "fresh",
          createdAt: now - 86_400_000,
          pinned: false,
        },
      ],
    }),
    "utf8",
  );

  validShelfPath = join(data, "shelf-source.txt");
  await writeFile(validShelfPath, "source stays", "utf8");
  const valid = await stat(validShelfPath);
  const missingPath = join(data, "missing-source.txt");
  await writeFile(
    join(data, "mqmz.file-shelf.json"),
    JSON.stringify({
      version: 1,
      files: [
        {
          id: randomUUID(),
          name: basename(validShelfPath),
          path: validShelfPath,
          size: valid.size,
          modifiedAt: valid.mtimeMs,
          device: valid.dev,
          inode: valid.ino,
          status: "shelved",
        },
        {
          id: randomUUID(),
          name: "missing-source.txt",
          path: missingPath,
          size: 0,
          modifiedAt: now,
          device: 0,
          inode: 0,
          status: "shelved",
        },
      ],
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
  todo = windows.find((item) => item.title.includes("待办清单"))!.page;
});

test.afterAll(async () => {
  await application?.close();
  await rm(directory, { recursive: true, force: true });
});

test("restart restores focus, reminders, clipboard and shelf state", async () => {
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.clipboard.entries.length : 0;
    })
    .toBe(2);
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok
        ? (snapshot.value.focus.waterNextAt ?? 0) > Date.now()
        : false;
    })
    .toBe(true);
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok
        ? (snapshot.value.focus.breakSittingNextAt ?? 0) > Date.now()
        : false;
    })
    .toBe(true);
  const snapshot = await pet.evaluate(() => window.mqmz!.snapshot());
  if (!snapshot.ok) throw new Error(snapshot.error);
  const state = snapshot.value;

  expect(state.focus.running).toBe(true);
  expect(state.focus.remaining).toBeGreaterThan(580);
  expect(state.focus.remaining).toBeLessThanOrEqual(600);

  const clipboardIds = state.clipboard.entries.map((entry) => entry.id);
  expect(clipboardIds).toContain(pinnedClipboardId);
  expect(clipboardIds).toContain(freshClipboardId);
  expect(clipboardIds).not.toContain("old-unpinned");

  expect(state.files.map((file) => file.name)).toContain("shelf-source.txt");
  expect(state.shelfInvalidCount).toBe(1);
  expect(state.focus.todos.map((item) => item.text)).toEqual(
    expect.arrayContaining(["旧逾期任务", "即将到期任务"]),
  );

  await expect
    .poll(async () => {
      const current = await pet.evaluate(() => window.mqmz!.snapshot());
      return current.ok
        ? current.value.events.some((event) =>
            event.message.includes("喝水提醒"),
          )
        : false;
    })
    .toBe(true);
  await expect
    .poll(async () => {
      const current = await pet.evaluate(() => window.mqmz!.snapshot());
      return current.ok
        ? current.value.events.some((event) =>
            event.message.includes("久坐提醒"),
          )
        : false;
    })
    .toBe(true);
  await expect
    .poll(async () => {
      const current = await pet.evaluate(() => window.mqmz!.snapshot());
      return current.ok
        ? current.value.events.some((event) =>
            event.message.includes("即将到期任务"),
          )
        : false;
    })
    .toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  const after = await pet.evaluate(() => window.mqmz!.snapshot());
  if (!after.ok) throw new Error(after.error);
  expect(
    after.value.events.filter((event) => event.message.includes("待办提醒")),
  ).toHaveLength(1);
  expect(
    after.value.events.some((event) => event.message.includes("旧逾期任务")),
  ).toBe(false);

  await pet.evaluate(() => window.mqmz!.command({ type: "todo-open" }));
  await expect
    .poll(async () => {
      const current = await pet.evaluate(() => window.mqmz!.snapshot());
      return current.ok ? current.value.todoOpen : false;
    })
    .toBe(true);
  const overdue = todo.locator(".todo-item", { hasText: "旧逾期任务" });
  await expect(overdue.locator(".todo-view-due.overdue")).toBeVisible();
});

test("shelf cleanup removes indexes but keeps source files", async () => {
  const snapshot = await pet.evaluate(() => window.mqmz!.snapshot());
  if (!snapshot.ok) throw new Error(snapshot.error);
  const shelf = snapshot.value.files.find(
    (file) => file.name === "shelf-source.txt",
  );
  expect(shelf).toBeTruthy();
  await pet.evaluate(
    (id) => window.mqmz!.command({ type: "remove-file", fileId: id }),
    shelf!.id,
  );
  await expect
    .poll(async () => {
      const current = await pet.evaluate(() => window.mqmz!.snapshot());
      return current.ok
        ? current.value.files.some((file) => file.name === "shelf-source.txt")
        : true;
    })
    .toBe(false);
  await pet.evaluate(() =>
    window.mqmz!.command({ type: "shelf-clear-invalid" }),
  );
  await expect
    .poll(async () => {
      const current = await pet.evaluate(() => window.mqmz!.snapshot());
      return current.ok ? current.value.files.length : -1;
    })
    .toBe(0);
  expect(await readFile(validShelfPath, "utf8")).toBe("source stays");
});

test("sleep/resume keeps elapsed focus time", async () => {
  const before = await pet.evaluate(() => window.mqmz!.snapshot());
  if (!before.ok) throw new Error(before.error);
  const remaining = before.value.focus.remaining;

  await application.evaluate(({ powerMonitor }, offset) => {
    const state = globalThis as typeof globalThis & {
      __mqmzRealNow?: () => number;
    };
    state.__mqmzRealNow = Date.now;
    Date.now = () => state.__mqmzRealNow!() + offset;
    powerMonitor.emit("resume");
  }, 120_000);
  await new Promise((resolve) => setTimeout(resolve, 1_300));

  const slept = await pet.evaluate(() => window.mqmz!.snapshot());
  if (!slept.ok) throw new Error(slept.error);
  expect(slept.value.focus.running).toBe(true);
  expect(slept.value.focus.remaining).toBeLessThanOrEqual(remaining - 110);
  expect(slept.value.focus.remaining).toBeGreaterThanOrEqual(remaining - 130);
  expect(
    slept.value.events.some((event) => event.message.includes("系统唤醒")),
  ).toBe(true);

  await application.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __mqmzRealNow?: () => number;
    };
    if (state.__mqmzRealNow) {
      Date.now = state.__mqmzRealNow;
      delete state.__mqmzRealNow;
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  const settled = await pet.evaluate(() => window.mqmz!.snapshot());
  if (!settled.ok) throw new Error(settled.error);
  expect(settled.value.focus.running).toBe(true);
});

test("manual forward clock jump rebases running timers", async () => {
  const before = await pet.evaluate(() => window.mqmz!.snapshot());
  if (!before.ok) throw new Error(before.error);
  const remaining = before.value.focus.remaining;

  await application.evaluate((_electron, offset) => {
    const state = globalThis as typeof globalThis & {
      __mqmzRealNow?: () => number;
    };
    state.__mqmzRealNow = Date.now;
    Date.now = () => state.__mqmzRealNow!() + offset;
  }, 300_000);
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  const jumped = await pet.evaluate(() => window.mqmz!.snapshot());
  if (!jumped.ok) throw new Error(jumped.error);
  expect(jumped.value.focus.remaining).toBeGreaterThanOrEqual(remaining - 5);
  expect(
    jumped.value.events.some((event) =>
      event.message.includes("系统时间向前调整"),
    ),
  ).toBe(true);

  await application.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __mqmzRealNow?: () => number;
    };
    if (state.__mqmzRealNow) {
      Date.now = state.__mqmzRealNow;
      delete state.__mqmzRealNow;
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  const settled = await pet.evaluate(() => window.mqmz!.snapshot());
  if (!settled.ok) throw new Error(settled.error);
  expect(settled.value.focus.remaining).toBeGreaterThanOrEqual(remaining - 5);
});

test("timezone change reschedules local daily reminders", async () => {
  await application.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __mqmzRealOffset?: () => number;
    };
    state.__mqmzRealOffset = Date.prototype.getTimezoneOffset;
    Date.prototype.getTimezoneOffset = function (this: Date) {
      return state.__mqmzRealOffset!.call(this) + 60;
    };
  });
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok
        ? snapshot.value.events.some((event) =>
            event.message.includes("时区变化"),
          )
        : false;
    })
    .toBe(true);
  await application.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __mqmzRealOffset?: () => number;
    };
    if (state.__mqmzRealOffset) {
      Date.prototype.getTimezoneOffset = state.__mqmzRealOffset;
      delete state.__mqmzRealOffset;
    }
  });
});

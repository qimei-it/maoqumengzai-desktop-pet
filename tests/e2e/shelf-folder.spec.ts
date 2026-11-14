import { _electron as electron, expect, test } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { waitForAppWindows } from "./app-windows";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let application: ElectronApplication;
let pet: Page;
let pocket: Page;
let directory: string;
let dataPath: string;
let folderPath: string;
let filePath: string;

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "mqmz-shelf-folder-"));
  const data = join(directory, "data");
  dataPath = data;
  const shots = join(directory, "shots");
  await mkdir(data, { recursive: true });
  await mkdir(shots, { recursive: true });

  folderPath = join(directory, "置物架素材");
  await mkdir(folderPath, { recursive: true });
  await writeFile(join(folderPath, "说明.txt"), "folder stays", "utf8");
  filePath = join(directory, "说明.txt");
  await writeFile(filePath, "source stays", "utf8");

  const folderInfo = await stat(folderPath);
  const fileInfo = await stat(filePath);
  await writeFile(
    join(data, "mqmz.file-shelf.json"),
    JSON.stringify({
      version: 2,
      files: [
        {
          id: randomUUID(),
          name: "说明.txt",
          path: filePath,
          size: fileInfo.size,
          modifiedAt: fileInfo.mtimeMs,
          device: fileInfo.dev,
          inode: fileInfo.ino,
          kind: "file",
          status: "shelved",
        },
        {
          id: randomUUID(),
          name: "置物架素材",
          path: folderPath,
          size: 0,
          modifiedAt: folderInfo.mtimeMs,
          device: folderInfo.dev,
          inode: folderInfo.ino,
          kind: "folder",
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
  pocket = windows.find((item) => item.title.includes("文件置物架"))!.page;
  await pet.evaluate(() => window.mqmz!.command({ type: "show-pocket" }));
  await expect(
    pocket.getByRole("button", { name: "新增文件", exact: true }),
  ).toBeVisible();
});

test.afterAll(async () => {
  await application?.close();
  await rm(directory, { recursive: true, force: true });
});

test("a restored folder sits on the shelf without byte size or drag-out", async () => {
  await expect(pocket.getByTestId("pocket-file")).toHaveCount(2);
  const folderRow = pocket.locator('[aria-label="文件夹 置物架素材"]');
  const fileRow = pocket.locator('[aria-label="文件 说明.txt"]');
  await expect(folderRow).toBeVisible();
  await expect(folderRow).toHaveAttribute("draggable", "false");
  await expect(folderRow.locator(".pocket-file-size")).toHaveCount(0);
  await expect(folderRow.locator(".pocket-drag-icon")).toHaveCount(0);
  await expect(fileRow).toHaveAttribute("draggable", "true");
  await expect(fileRow.locator(".pocket-file-size")).toHaveCount(1);
  const folderIcon = await folderRow
    .locator(".pocket-file-symbol img")
    .getAttribute("src");
  const fileIcon = await fileRow
    .locator(".pocket-file-symbol img")
    .getAttribute("src");
  expect(folderIcon).toBeTruthy();
  expect(fileIcon).toBeTruthy();
  expect(folderIcon).not.toBe(fileIcon);

  await folderRow.click();
  await expect(
    pocket.getByRole("button", { name: "格式转换", exact: true }),
  ).toBeDisabled();
  await expect(
    pocket.getByRole("button", { name: "另存副本", exact: true }),
  ).toBeDisabled();
  await expect(
    pocket.getByRole("button", { name: "定位源文件", exact: true }),
  ).toBeEnabled();

  await fileRow.click();
  await expect(
    pocket.getByRole("button", { name: "格式转换", exact: true }),
  ).toBeEnabled();
  await expect(
    pocket.getByRole("button", { name: "另存副本", exact: true }),
  ).toBeEnabled();
});

test("removing a folder keeps the directory on disk", async () => {
  const folderRow = pocket.locator('[aria-label="文件夹 置物架素材"]');
  await folderRow.click();
  await pocket
    .getByRole("button", { name: "移出置物架", exact: true })
    .click();
  await expect(folderRow).toHaveCount(0);
  await expect(pocket.getByTestId("pocket-file")).toHaveCount(1);
  expect((await stat(folderPath)).isDirectory()).toBe(true);

  const fileRow = pocket.locator('[aria-label="文件 说明.txt"]');
  await fileRow.click();
  await pocket
    .getByRole("button", { name: "移出置物架", exact: true })
    .click();
  await expect(pocket.getByTestId("pocket-file")).toHaveCount(0);
  await expect(
    pocket.getByRole("button", { name: "添加本地文件或目录", exact: true }),
  ).toBeVisible();
  expect((await stat(filePath)).isFile()).toBe(true);
});

test("the add-entry picker writes a folder into the shelf index", async () => {
  await application.evaluate(({ dialog }, folder) => {
    const state = globalThis as unknown as {
      __mqmzDialog?: typeof dialog.showOpenDialog;
    };
    state.__mqmzDialog = dialog.showOpenDialog;
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [folder],
      bookmarks: [],
    })) as typeof dialog.showOpenDialog;
  }, folderPath);
  const added = await pocket.evaluate(() => window.mqmz!.selectEntry());
  expect(added.ok, added.ok ? "" : added.error).toBe(true);
  await expect(pocket.getByTestId("pocket-file")).toHaveCount(1);
  const folderRow = pocket.locator('[aria-label="文件夹 置物架素材"]');
  await expect(folderRow).toBeVisible();
  await expect(folderRow).toHaveAttribute("draggable", "false");

  const stored = JSON.parse(
    await readFile(join(dataPath, "mqmz.file-shelf.json"), "utf8"),
  );
  expect(stored.version).toBe(2);
  expect(stored.files).toEqual([
    expect.objectContaining({
      kind: "folder",
      path: await realpath(folderPath),
      size: 0,
    }),
  ]);

  await application.evaluate(({ dialog }) => {
    const state = globalThis as unknown as {
      __mqmzDialog?: typeof dialog.showOpenDialog;
    };
    if (state.__mqmzDialog) dialog.showOpenDialog = state.__mqmzDialog;
  });
});

import { _electron as electron, expect, test } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { waitForAppWindows } from "./app-windows";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
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
  directory = await mkdtemp(join(tmpdir(), "mqmz-shelf-clear-"));
  const data = join(directory, "data");
  dataPath = data;
  await mkdir(data, { recursive: true });

  folderPath = join(directory, "清空素材");
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
          name: "清空素材",
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
  await expect(pocket.getByTestId("pocket-file")).toHaveCount(2);
});

test.afterAll(async () => {
  await application?.close();
  await rm(directory, { recursive: true, force: true });
});

test("clearing the shelf drops every index entry and keeps the sources", async () => {
  await expect(
    pocket.getByRole("button", { name: "清空置物架", exact: true }),
  ).toBeVisible();

  for (const name of [
    "新增文件",
    "格式转换",
    "另存副本",
    "移出置物架",
    "定位源文件",
    "清空置物架",
  ]) {
    await expect(
      pocket.getByRole("button", { name, exact: true }),
    ).toBeVisible();
  }
  const layout = await pocket.evaluate(() => ({
    actionsVisible:
      document.querySelector(".pocket-actions")!.getBoundingClientRect()
        .bottom <= innerHeight - 6,
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
  }));
  expect(layout.actionsVisible).toBe(true);
  expect(layout.horizontalOverflow).toBe(false);

  // Enabled removal actions share the same danger styling. The color change
  // runs through the button's transition, so wait for it to settle.
  await pocket.getByTestId("pocket-file").first().click();
  const removeButton = pocket.getByRole("button", {
    name: "移出置物架",
    exact: true,
  });
  await expect(removeButton).toBeEnabled();
  const clearColor = await pocket
    .getByRole("button", { name: "清空置物架", exact: true })
    .evaluate((element) => getComputedStyle(element).color);
  const plainColor = await pocket
    .getByRole("button", { name: "格式转换", exact: true })
    .evaluate((element) => getComputedStyle(element).color);
  expect(clearColor).not.toBe(plainColor);
  await expect(removeButton).toHaveCSS("color", clearColor);

  await pocket
    .getByRole("button", { name: "清空置物架", exact: true })
    .click();

  await expect(pocket.getByTestId("pocket-file")).toHaveCount(0);
  await expect(
    pocket.getByRole("button", { name: "选择本地文件与目录", exact: true }),
  ).toBeVisible();

  const stored = JSON.parse(
    await readFile(join(dataPath, "mqmz.file-shelf.json"), "utf8"),
  );
  expect(stored.version).toBe(2);
  expect(stored.files).toEqual([]);
  expect((await stat(filePath)).isFile()).toBe(true);
  expect((await stat(folderPath)).isDirectory()).toBe(true);
});

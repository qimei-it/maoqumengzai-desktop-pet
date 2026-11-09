import { _electron as electron, expect, test } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

let application: ElectronApplication;
let lab: Page;
let pet: Page;
let pocket: Page;
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
  delete environment.ELECTRON_RUN_AS_NODE;
  launchEnvironment = environment;
  application = await electron.launch({
    args: [resolve(".")],
    env: environment,
  });
  await expect.poll(() => application.windows().length).toBe(3);
  const windows = await Promise.all(
    application
      .windows()
      .map(async (page) => ({ page, title: await page.title() })),
  );
  lab = windows.find((item) => item.title.includes("验证台"))!.page;
  pet = windows.find((item) => item.title.includes("交互标记"))!.page;
  pocket = windows.find((item) => item.title.includes("文件置物架"))!.page;
  startupVisibility = await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((window) => ({
      title: window.getTitle(),
      visible: window.isVisible(),
    })),
  );
  await lab.evaluate(() => window.mqmz!.command({ type: "show-lab" }));
  for (const page of [lab, pet, pocket]) {
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
  expect(lab.url()).toMatch(/^file:/);
  await expect(lab).toHaveTitle("毛趣萌仔 · P0 验证台");
  await expect(pet.locator(".marker")).toBeVisible();
  await expect(lab.locator(".file-outline")).toHaveClass(/lucide-inbox/);
  await expect(pocket.locator(".pocket-icon-button svg")).toHaveClass(
    /lucide-x/,
  );
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
    .toBe(464);
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
    const transparent = { x: 48, y: 48 };
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
  await expect(pocket.getByTestId("pocket-file")).toHaveAttribute(
    "draggable",
    "true",
  );
  await expect(pocket.locator(".pocket-file-symbol svg")).toHaveClass(
    /lucide-file/,
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
    pocket.getByRole("button", { name: "转换格式", exact: true }),
  ).toBeDisabled();
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
    await expect(pocket.locator(".button-pair .button-glass")).toHaveCSS(
      "background-color",
      theme.ink,
    );
    const styles = await pocket.evaluate(() => {
      const action = document.querySelector<HTMLButtonElement>(
        ".button-pair .button-glass",
      )!;
      const secondary = document.querySelector<HTMLButtonElement>(
        ".button-pair .button-soft",
      )!;
      const footer = document
        .querySelector(".pocket-footer")!
        .getBoundingClientRect();
      return {
        brand: getComputedStyle(document.documentElement)
          .getPropertyValue("--color-brand")
          .trim(),
        canvas: getComputedStyle(document.querySelector(".pocket-surface")!)
          .backgroundColor,
        ink: getComputedStyle(action).backgroundColor,
        iconInk: getComputedStyle(
          document.querySelector(".pocket-file-symbol svg")!,
        ).stroke,
        color: getComputedStyle(
          document.querySelector(".pocket-file-description strong")!,
        ).color,
        bodySize: getComputedStyle(action).fontSize,
        height: action.getBoundingClientRect().height,
        widthDifference: Math.abs(
          action.getBoundingClientRect().width -
            secondary.getBoundingClientRect().width,
        ),
        footerVisible: footer.bottom <= innerHeight - 6,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(styles.brand).toBe(theme.brand);
    expect(styles.canvas).toBe(theme.canvas);
    expect(styles.ink).toBe(theme.ink);
    expect(styles.iconInk).toBe(theme.ink);
    expect(styles.color).toBe("rgb(26, 26, 26)");
    expect(styles.bodySize).toBe("14px");
    expect(styles.height).toBeGreaterThanOrEqual(44);
    expect(styles.widthDifference).toBeLessThanOrEqual(1);
    expect(styles.footerVisible).toBe(true);
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
  await expect(pocket.locator(".button-pair .button-glass")).toHaveCSS(
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
  await pocket.getByRole("button", { name: "移除记录", exact: true }).click();
  await pocket
    .locator("#mqmz-card-input")
    .evaluate((element) => element.remove());
  expect(await readFile(fixture, "utf8")).toBe("drag-card-fixture");
});

async function dropOnPet(
  fixture: string,
  region: "center" | "left" | "right" | "outside",
): Promise<void> {
  await pet.evaluate(() => {
    document.querySelector("#mqmz-drop-input")?.remove();
    const input = document.createElement("input");
    input.type = "file";
    input.id = "mqmz-drop-input";
    input.hidden = true;
    document.body.append(input);
  });
  await pet.locator("#mqmz-drop-input").setInputFiles(fixture);
  await pet.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>("#mqmz-drop-input")!;
    const transfer = new DataTransfer();
    transfer.items.add(input.files![0]);
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
    .toBe(468);
  const box = await pet.locator(".marker").boundingBox();
  if (!box) throw new Error("Marker is not rendered");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const point =
    region === "center"
      ? { x: cx, y: cy }
      : region === "right"
        ? { x: cx + 118, y: cy }
        : region === "left"
          ? { x: cx - 118, y: cy }
          : { x: cx, y: cy + 216 };
  await pet.evaluate(({ x, y }) => {
    const input = document.querySelector<HTMLInputElement>("#mqmz-drop-input")!;
    const transfer = new DataTransfer();
    transfer.items.add(input.files![0]);
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

test("dragging over the pet opens the two-half donut and Esc closes it", async () => {
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
    transfer.items.add(input.files![0]);
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
  await expect(pet.locator(".donut-hole")).toBeVisible();
  await expect(pet.locator('[data-region="convert"]')).toContainText("格式转换");
  await expect(pet.locator('[data-region="eat"]')).toContainText("吃掉");
  const box = await pet.locator(".marker").boundingBox();
  if (!box) throw new Error("Marker is not rendered");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const hover = async (x: number, y: number) => {
    await pet.evaluate(({ x, y }) => {
      const input = document.querySelector<HTMLInputElement>("#mqmz-donut-input")!;
      const transfer = new DataTransfer();
      transfer.items.add(input.files![0]);
      document.querySelector(".pet-surface")!.dispatchEvent(
        new DragEvent("dragover", {
          dataTransfer: transfer,
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
        }),
      );
    }, { x, y });
  };
  await hover(cx + 118, cy);
  await expect(pet.locator('[data-region="eat"]')).toHaveClass(/active/);
  await pet.waitForTimeout(220);
  await pet.screenshot({
    path: "/tmp/mqmz-donut.png",
    omitBackground: true,
  });
  await hover(cx - 118, cy);
  await expect(pet.locator('[data-region="convert"]')).toHaveClass(/active/);
  await pet.waitForTimeout(220);
  await pet.screenshot({
    path: "/tmp/mqmz-donut-convert.png",
    omitBackground: true,
  });
  await hover(cx, cy);
  await expect(pet.locator(".donut-hole")).toHaveClass(/active/);
  await pet.waitForTimeout(220);
  await pet.screenshot({
    path: "/tmp/mqmz-donut-center.png",
    omitBackground: true,
  });
  await pet.keyboard.press("Escape");
  await expect(pet.locator(".donut-ring")).toHaveCount(0);
  const state = await lab.evaluate(() => window.mqmz!.snapshot());
  expect(state.ok && state.value.wheelOpen).toBe(false);
  expect(state.ok && state.value.files.length).toBe(0);
  expect(state.ok && state.value.petBounds.width).toBe(232);
  await pet
    .locator("#mqmz-donut-input")
    .evaluate((element) => element.remove());
});

test("dropping on the centre stashes without opening the shelf", async () => {
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
  await dropOnPet(fixture, "center");
  await expect
    .poll(async () => {
      const snapshot = await lab.evaluate(() => window.mqmz!.snapshot());
      return snapshot.ok ? snapshot.value.files[0]?.status : undefined;
    })
    .toBe("shelved");
  const state = await lab.evaluate(() => window.mqmz!.snapshot());
  expect(state.ok && state.value.wheelOpen).toBe(false);
  expect(state.ok && state.value.petBounds.width).toBe(232);
  expect(
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.getTitle().includes("文件置物架"))!
        .isVisible(),
    ),
  ).toBe(false);
  await pet.evaluate(() => window.mqmz!.command({ type: "show-pocket" }));
  await expect(
    pocket.getByRole("button", { name: "已暂存到置物架", exact: true }),
  ).toBeDisabled();
  await pocket.getByRole("button", { name: "移除记录", exact: true }).click();
});

test("dropping on the right half eats the file into a reversible belly", async () => {
  const fixture = join(directory, "被吃掉.txt");
  await writeFile(fixture, "eaten-bytes");
  await dropOnPet(fixture, "right");
  await expect(pet.getByRole("status")).toContainText("7 天内");
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

test("dropping on the left half states that conversion is not wired yet", async () => {
  const fixture = join(directory, "待转换.png");
  await writeFile(fixture, "not-a-real-png");
  await dropOnPet(fixture, "left");
  await expect(pet.getByRole("status")).toContainText("格式转换引擎尚未接入");
  await expect(pet.getByRole("status")).toContainText("JPG");
  const state = await lab.evaluate(() => window.mqmz!.snapshot());
  expect(state.ok && state.value.files.length).toBe(0);
  expect(state.ok && state.value.belly.length).toBe(0);
  expect(state.ok && state.value.wheelOpen).toBe(false);
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
    await pocket.getByRole("button", { name: "移除记录", exact: true }).click();
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

test("stashing persists a local index across restart and removing the card preserves the original", async () => {
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
  await pocket
    .getByRole("button", { name: "暂存到置物架", exact: true })
    .click();
  await expect(pocket.getByRole("status")).toContainText("重启后仍可找到");
  const stored = JSON.parse(
    await readFile(join(directory, "data", "mqmz.file-shelf.json"), "utf8"),
  );
  expect(stored.files[0].path).toBe(await realpath(fixture));
  await application.close();
  application = await electron.launch({
    args: [resolve(".")],
    env: launchEnvironment,
  });
  await expect.poll(() => application.windows().length).toBe(3);
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
    pocket.getByRole("button", { name: "已暂存到置物架", exact: true }),
  ).toBeDisabled();
  await pocket.getByRole("button", { name: "移除记录", exact: true }).click();
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

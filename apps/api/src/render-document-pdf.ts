import puppeteer, { type Browser } from "puppeteer";
import { renderFieldDocumentHtml, type FieldDocumentData } from "@nnact/shared";

let browserPromise: Promise<Browser> | null = null;

function launchOptions(): Parameters<typeof puppeteer.launch>[0] {
  return {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
  };
}

async function launchBrowser(): Promise<Browser> {
  const browser = await puppeteer.launch(launchOptions());
  // If the Chromium process dies (OOM, kill, network drop), drop the cached
  // promise so the next render launches a fresh instance instead of failing
  // on a dead handle forever.
  browser.on("disconnected", () => {
    void browserPromise
      ?.then((current) => {
        if (current === browser) browserPromise = null;
      })
      .catch(() => {});
  });
  return browser;
}

async function getBrowser(): Promise<Browser> {
  if (process.env.NODE_ENV === "test") {
    return launchBrowser();
  }
  if (!browserPromise) {
    browserPromise = launchBrowser();
  }
  try {
    return await browserPromise;
  } catch (cause) {
    browserPromise = null;
    const hint =
      process.env.PUPPETEER_EXECUTABLE_PATH
        ? `Could not launch Chromium at ${process.env.PUPPETEER_EXECUTABLE_PATH}.`
        : "Could not launch Chromium. Install puppeteer or set PUPPETEER_EXECUTABLE_PATH to a system browser.";
    throw new Error(`${hint} ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

/** Closes the shared Chromium instance (tests and graceful shutdown). */
export async function closeDocumentPdfBrowser(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close();
}

async function renderPdfPage(browser: Browser, html: string): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    await page.emulateMediaType("print");
    const pdf = await page.pdf({
      format: "letter",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}

export async function renderFieldDocumentPdfFromHtml(html: string): Promise<Buffer> {
  const ownsBrowser = process.env.NODE_ENV === "test";
  let browser = await getBrowser();
  try {
    try {
      return await renderPdfPage(browser, html);
    } catch (cause) {
      if (ownsBrowser) throw cause;
      // The shared browser may have died between getBrowser() and render.
      // Drop the cached promise and retry once against a fresh instance.
      browserPromise = null;
      browser = await getBrowser();
      return await renderPdfPage(browser, html);
    }
  } finally {
    if (ownsBrowser) await browser.close().catch(() => {});
  }
}

/** Renders a PDF from the same HTML template used by the web document preview. */
export async function renderFieldDocumentPdf(data: FieldDocumentData): Promise<Buffer> {
  return renderFieldDocumentPdfFromHtml(renderFieldDocumentHtml(data));
}

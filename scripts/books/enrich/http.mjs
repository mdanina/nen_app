export async function fetchWithRetry(url, options = {}) {
  const { attempts = 2, timeoutMs = 10_000, ...request } = options;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        ...request,
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "user-agent": "NEN books enrichment tool/1.0 (+catalog maintenance)",
          accept: "application/json,text/html,application/xml;q=0.9,*/*;q=0.8",
          ...(request.headers ?? {}),
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  throw lastError;
}

export async function fetchText(url, options) {
  return (await fetchWithRetry(url, options)).text();
}

export async function fetchJson(url, options) {
  return (await fetchWithRetry(url, options)).json();
}

export async function verifyImage(url) {
  if (!String(url ?? "").startsWith("https://")) return false;
  try {
    const response = await fetchWithRetry(url, { attempts: 1, timeoutMs: 8_000, headers: { range: "bytes=0-1023" } });
    const contentRange = response.headers.get("content-range")?.match(/\/(\d+)$/u)?.[1];
    const totalBytes = Number(contentRange ?? response.headers.get("content-length") ?? 0);
    return String(response.headers.get("content-type") ?? "").toLowerCase().startsWith("image/") && (!totalBytes || totalBytes >= 1_500);
  } catch {
    return false;
  }
}

export async function mapLimit(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index], index);
    }
  }));
  return output;
}

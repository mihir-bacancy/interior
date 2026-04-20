import "server-only";

const DEFAULT_BASE_URL = "https://api.outstand.so/v1";

export type OutstandAccount = {
  id: string;
  network: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  raw: Record<string, unknown>;
};

export type OutstandMedia = {
  mediaId: string;
  url: string;
  filename: string;
};

function baseUrl() {
  return (process.env.OUTSTAND_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function apiKey() {
  const k = (process.env.OUTSTAND_API_KEY || "").trim();
  if (!k) throw new Error("OUTSTAND_API_KEY is not set");
  return k;
}

function unwrap<T = unknown>(payload: unknown): T {
  if (payload && typeof payload === "object" && "success" in (payload as Record<string, unknown>)) {
    const p = payload as { success: boolean; data?: unknown; message?: string; error?: string };
    if (p.success === false) {
      throw new Error(p.message || p.error || "Outstand request failed");
    }
    if ("data" in p && p.data !== undefined) return p.data as T;
  }
  return payload as T;
}

async function request<T>(method: "GET" | "POST" | "PUT", path: string, init?: { query?: Record<string, string | number | undefined>; body?: unknown; authenticated?: boolean }): Promise<T> {
  const url = new URL(`${baseUrl()}/${path.replace(/^\/+/, "")}`);
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init?.authenticated !== false) headers["Authorization"] = `Bearer ${apiKey()}`;
  if (init?.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Outstand ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  if (!text) return {} as T;
  try {
    return unwrap<T>(JSON.parse(text));
  } catch {
    return {} as T;
  }
}

function str(...vals: unknown[]): string | undefined {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

function normalizeAccount(raw: Record<string, unknown>): OutstandAccount {
  const id = str(raw.id, raw.account_id, raw.outstand_account_id);
  const network = str(raw.network, raw.platform);
  if (!id || !network) throw new Error("Outstand account missing id/network");
  return {
    id,
    network,
    username: str(raw.username),
    displayName: str(raw.display_name, (raw as Record<string, unknown>).displayName, raw.name),
    avatarUrl: str(raw.avatar_url, (raw as Record<string, unknown>).avatarUrl),
    raw,
  };
}

// ---------- accounts ----------

export async function listInstagramAccounts(): Promise<OutstandAccount[]> {
  const payload = await request<unknown>("GET", "/social-accounts", { query: { limit: 100, offset: 0 } });
  const list: unknown[] = Array.isArray(payload)
    ? payload
    : (payload && typeof payload === "object")
      ? (() => {
          const p = payload as Record<string, unknown>;
          for (const key of ["accounts", "social_accounts", "items", "data"]) {
            if (Array.isArray(p[key])) return p[key] as unknown[];
          }
          return [];
        })()
      : [];

  return list
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .map(normalizeAccount)
    .filter((a) => a.network.toLowerCase() === "instagram");
}

// ---------- media upload ----------

function pickFilename(contentType: string, base: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes("quicktime")) return `${base}.mov`;
  if (ct.includes("webm")) return `${base}.webm`;
  return `${base}.mp4`;
}

/** Download the remote URL and upload it to Outstand, returning the canonical media url. */
export async function uploadRemoteVideo(input: { sourceUrl: string; filenameBase: string }): Promise<OutstandMedia> {
  const res = await fetch(input.sourceUrl);
  if (!res.ok) throw new Error(`Source video fetch failed (${res.status}) ${input.sourceUrl}`);
  const contentType = res.headers.get("content-type") || "video/mp4";
  const filename = pickFilename(contentType, input.filenameBase);

  const createPayload = await request<Record<string, unknown>>("POST", "/media/upload", {
    body: { filename, content_type: contentType },
  });
  const mediaId = str(createPayload.media_id, createPayload.mediaId, createPayload.id);
  const uploadUrl = str(createPayload.upload_url, createPayload.uploadUrl);
  if (!mediaId || !uploadUrl) throw new Error("Outstand upload URL missing from response");

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: await res.arrayBuffer(),
  });
  if (!put.ok) {
    const text = await put.text();
    throw new Error(`Outstand PUT failed (${put.status}): ${text.slice(0, 300)}`);
  }

  const confirmPayload = await request<Record<string, unknown>>("POST", `/media/${encodeURIComponent(mediaId)}/confirm`);
  const media = (confirmPayload.media && typeof confirmPayload.media === "object")
    ? (confirmPayload.media as Record<string, unknown>)
    : confirmPayload;
  const url = str((media as Record<string, unknown>).url) || str(createPayload.url);
  if (!url) throw new Error("Outstand confirm missing media url");

  return { mediaId, url, filename };
}

// ---------- posts ----------

export type OutstandPostResult = { postId: string; status: string };

export async function createPost(input: {
  accounts: string[];
  caption: string;
  mediaUrl: string;
  filename: string;
}): Promise<OutstandPostResult> {
  const payload = await request<Record<string, unknown>>("POST", "/posts/", {
    body: {
      accounts: input.accounts,
      content: input.caption,
      containers: [
        {
          platform: "instagram",
          content: input.caption,
          media: [{ url: input.mediaUrl, filename: input.filename }],
        },
      ],
    },
  });
  const post = (payload.post && typeof payload.post === "object")
    ? (payload.post as Record<string, unknown>)
    : payload;
  const postId = str((post as Record<string, unknown>).id, (post as Record<string, unknown>).post_id, (post as Record<string, unknown>).postId);
  if (!postId) throw new Error(`Outstand post id missing: ${JSON.stringify(payload).slice(0, 200)}`);
  return {
    postId,
    status: str((post as Record<string, unknown>).status, (post as Record<string, unknown>).state) || "submitted",
  };
}

export async function getPostStatus(postId: string): Promise<{ status: string; externalId?: string; error?: string }> {
  const payload = await request<Record<string, unknown>>("GET", `/posts/${encodeURIComponent(postId)}/`);
  const post = (payload.post && typeof payload.post === "object")
    ? (payload.post as Record<string, unknown>)
    : payload;
  return {
    status: str((post as Record<string, unknown>).status, (post as Record<string, unknown>).state) || "",
    externalId: str((post as Record<string, unknown>).external_id, (post as Record<string, unknown>).externalId),
    error: str((post as Record<string, unknown>).error),
  };
}

/**
 * Google Drive (OPTIONAL) — turn the brief's HTML into a native Google Doc,
 * filed in one "Client Onboarding" folder. The folder id is remembered in
 * app_state so we don't re-search Drive each time (and with the drive.file scope
 * Drive only shows us files we created, so the cache is what makes it findable).
 *
 * Any failure returns a tagged {ok:false, reason} — never throws — so the brief
 * still gets stored and (optionally) pinged to Telegram without the Doc.
 */
import { getState, setState, deleteState } from "@/lib/supabase";
import { accessToken } from "@/lib/google";

const FOLDER_NAME = "Client Onboarding";
const FOLDER_KEY = "drive_folder_id";

export type DocResult = { ok: true; id: string; url: string } | { ok: false; reason: string };

async function createFolder(token: string): Promise<string | null> {
  const resp = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!resp.ok) return null;
  const j = (await resp.json()) as { id?: string };
  return j.id ?? null;
}

async function ensureFolder(token: string): Promise<string | null> {
  const cached = await getState(FOLDER_KEY);
  if (cached) return cached;
  try {
    const q = encodeURIComponent(
      `mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`
    );
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`,
      { headers: { authorization: `Bearer ${token}` } }
    );
    if (resp.ok) {
      const j = (await resp.json()) as { files?: Array<{ id: string }> };
      const id = j.files?.[0]?.id;
      if (id) {
        await setState(FOLDER_KEY, id);
        return id;
      }
    }
  } catch {
    /* fall through to create */
  }
  const created = await createFolder(token);
  if (created) await setState(FOLDER_KEY, created);
  return created;
}

async function uploadDoc(token: string, name: string, html: string, folderId: string | null): Promise<DocResult> {
  const boundary = `brief_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const metadata: Record<string, unknown> = { name, mimeType: "application/vnd.google-apps.document" };
  if (folderId) metadata.parents = [folderId];
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/html; charset=UTF-8\r\n\r\n` +
    `${html}\r\n` +
    `--${boundary}--`;
  const resp = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": `multipart/related; boundary=${boundary}` },
      body,
    }
  );
  if (!resp.ok) return { ok: false, reason: `drive_${resp.status}` };
  const j = (await resp.json()) as { id?: string; webViewLink?: string };
  if (!j.id) return { ok: false, reason: "drive_no_id" };
  return { ok: true, id: j.id, url: j.webViewLink || `https://docs.google.com/document/d/${j.id}/edit` };
}

export async function createBriefDoc(params: { name: string; html: string }): Promise<DocResult> {
  const token = await accessToken();
  if (!token) return { ok: false, reason: "google_not_connected" };

  let folderId = await ensureFolder(token);
  let result = await uploadDoc(token, params.name, params.html, folderId);

  // If the cached folder was trashed upstream, Drive rejects the parent (404):
  // drop the stale cache, make a fresh folder, retry once.
  if (!result.ok && result.reason === "drive_404" && folderId) {
    await deleteState(FOLDER_KEY);
    folderId = await createFolder(token);
    if (folderId) await setState(FOLDER_KEY, folderId);
    result = await uploadDoc(token, params.name, params.html, folderId);
  }
  return result;
}

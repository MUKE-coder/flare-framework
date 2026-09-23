"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Dropzone } from "@/components/dashboard/dropzone";
import { createUploadUrlAction } from "@/app/dashboard/actions";
import { saveFileAction } from "@/app/dashboard/drive/actions";
import { formatBytes } from "@/lib/bytes";

/** How many files go up at once. More than this and each one just gets slower. */
const AT_ONCE = 3;

/** The limit on the File resource's `content` field, repeated here to fail early. */
const MAX_BYTES = 100 * 1024 * 1024;

type State = "waiting" | "uploading" | "done" | "failed";

interface Job {
  id: number;
  name: string;
  size: number;
  loaded: number;
  state: State;
  error?: string;
  abort?: () => void;
}

/** PUT with progress events, which fetch() can't report for uploads. */
function put(url: string, file: File, onProgress: (loaded: number) => void, signal: { abort?: () => void }) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    signal.abort = () => request.abort();
    request.upload.onprogress = (event) => onProgress(event.loaded);
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) return resolve();
      let message = `Upload failed (${request.status}).`;
      try {
        message = (JSON.parse(request.responseText) as { error?: string }).error ?? message;
      } catch {
        // Not JSON: keep the status message.
      }
      reject(new Error(message));
    };
    request.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    request.onabort = () => reject(new DOMException("Upload cancelled.", "AbortError"));
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.send(file);
  });
}

/**
 * Drop a pile of files into the current folder.
 *
 * Each file is three steps: ask the server to sign an upload, PUT the bytes straight to
 * storage, then save the record. The bytes never pass through the app, so a hundred
 * megabytes costs the Worker nothing, and the signing step is where permission and the
 * size limit are checked — the browser's own check below is only there to fail fast.
 *
 * Three go at once. The rest wait, because a browser opening thirty connections makes
 * every one of them slower and the progress bars meaningless.
 */
export function Uploader({ folderId }: { folderId: string | null }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const nextId = useRef(0);
  const running = useRef(0);
  const queue = useRef<{ job: Job; file: File }[]>([]);

  const update = (id: number, change: Partial<Job>) => setJobs((current) => current.map((job) => (job.id === id ? { ...job, ...change } : job)));

  async function run(job: Job, file: File) {
    running.current += 1;
    update(job.id, { state: "uploading" });
    const signal: { abort?: () => void } = {};
    update(job.id, { abort: () => signal.abort?.() });

    try {
      const contentType = file.type || "application/octet-stream";
      const signed = await createUploadUrlAction("File", "content", { name: file.name, type: contentType, size: file.size });
      if (!signed.ok) throw new Error(signed.error);

      await put(signed.data.url, file, (loaded) => update(job.id, { loaded }), signal);

      const saved = await saveFileAction({
        name: file.name,
        folderId,
        content: signed.data.key,
        size: file.size,
        contentType,
      });
      if (!saved.ok) throw new Error(saved.error);

      update(job.id, { state: "done", loaded: file.size });
      router.refresh();
    } catch (cause) {
      const cancelled = cause instanceof DOMException && cause.name === "AbortError";
      update(job.id, { state: "failed", error: cancelled ? "Cancelled." : cause instanceof Error ? cause.message : "Upload failed." });
      if (!cancelled) toast.error(`${file.name}: ${cause instanceof Error ? cause.message : "upload failed"}`);
    } finally {
      running.current -= 1;
      next();
    }
  }

  function next() {
    while (running.current < AT_ONCE && queue.current.length > 0) {
      const item = queue.current.shift()!;
      void run(item.job, item.file);
    }
  }

  function take(picked: File[]) {
    const accepted: Job[] = [];
    for (const file of picked) {
      const job: Job = { id: nextId.current++, name: file.name, size: file.size, loaded: 0, state: "waiting" };
      if (file.size > MAX_BYTES) {
        accepted.push({ ...job, state: "failed", error: `${formatBytes(file.size)} is over the ${formatBytes(MAX_BYTES)} limit.` });
        continue;
      }
      accepted.push(job);
      queue.current.push({ job, file });
    }
    setJobs((current) => [...current, ...accepted]);
    next();
  }

  const active = jobs.filter((job) => job.state === "waiting" || job.state === "uploading");
  const finished = jobs.filter((job) => job.state === "done");

  return (
    <div className="flex flex-col gap-3">
      <Dropzone
        onFiles={take}
        multiple
        label="Drop files here"
        hint={`Anything, up to ${formatBytes(MAX_BYTES)} each`}
        className="py-6"
      />

      {jobs.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {active.length > 0 ? `Uploading ${active.length} file${active.length === 1 ? "" : "s"}…` : `${finished.length} uploaded`}
            </span>
            {active.length === 0 && (
              <Button variant="ghost" size="sm" onClick={() => setJobs([])}>
                Clear
              </Button>
            )}
          </div>

          {jobs.map((job) => (
            <div key={job.id} className="flex items-center gap-3 text-sm">
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate">{job.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {job.state === "failed" ? job.error : formatBytes(job.size)}
                  </span>
                </span>
                {job.state === "uploading" && <Progress value={job.size ? (job.loaded / job.size) * 100 : 0} className="h-1" />}
              </span>
              {job.state === "uploading" && (
                <>
                  <Spinner />
                  <Button variant="ghost" size="icon" className="size-7" aria-label={`Cancel ${job.name}`} onClick={() => job.abort?.()}>
                    <XIcon />
                  </Button>
                </>
              )}
              {job.state === "done" && <CheckIcon className="text-success" aria-label="Uploaded" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

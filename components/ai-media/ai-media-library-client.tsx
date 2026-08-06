"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Download,
  FileVideo,
  Pause,
  Play,
  PlayCircle,
  Sparkles,
  Tag,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { createAiMediaAsset } from "@/app/(app)/ai-media/actions";
import {
  AI_MEDIA_BUCKET,
  AI_MEDIA_CATEGORIES,
  AI_MEDIA_FILE_ACCEPT,
  AI_MEDIA_MAX_FILE_SIZE_LABEL,
  AI_MEDIA_SUPPORTED_FORMATS_LABEL,
  validateAiMediaFile,
  type AiMediaCategory,
} from "@/lib/ai-media/constants";
import {
  createResumableAiMediaUpload,
  type ResumableUploadHandle,
} from "@/lib/ai-media/resumable-upload";
import type { AiMediaListItem } from "@/lib/queries/aiMedia";
import { createClient } from "@/lib/supabase/client";

type AiMediaItem = AiMediaListItem & { isDemo?: boolean };
type UploadStage = "idle" | "uploading" | "paused" | "saving";

const DEMO_MEDIA: AiMediaItem[] = [
  {
    id: -1,
    title: "Alaya POS Promo",
    category: "Marketing",
    createdBy: "Amir",
    tags: ["POS", "Retail", "Cloud"],
    description:
      "AI-generated promotional video introducing the Alaya POS cloud retail experience.",
    fileName: "alaya-pos-promo.mp4",
    fileSizeBytes: 0,
    createdAt: "2026-08-04T03:20:00.000Z",
    isDemo: true,
  },
  {
    id: -2,
    title: "AI Competition Demo",
    category: "Internal",
    createdBy: "Ianne",
    tags: ["AI", "Automation"],
    description:
      "Internal concept video prepared for the company AI competition showcase.",
    fileName: "ai-competition-demo.mp4",
    fileSizeBytes: 0,
    createdAt: "2026-08-03T08:45:00.000Z",
    isDemo: true,
  },
  {
    id: -3,
    title: "Sales Pitch Video",
    category: "Sales",
    createdBy: "Hariz",
    tags: ["Demo", "Customer"],
    description:
      "Short AI-assisted product overview for customer demonstrations and sales meetings.",
    fileName: "sales-pitch-video.mp4",
    fileSizeBytes: 0,
    createdAt: "2026-08-01T01:15:00.000Z",
    isDemo: true,
  },
];

const selectClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes < 10 ? megabytes.toFixed(1) : megabytes.toFixed(0)} MB`;
}

export function AiMediaLibraryClient({
  currentUserId,
  initialItems,
}: {
  currentUserId: number;
  initialItems: AiMediaListItem[];
}) {
  const [items, setItems] = useState<AiMediaItem[]>([
    ...initialItems,
    ...DEMO_MEDIA,
  ]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<AiMediaItem | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<AiMediaCategory>("Marketing");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [uploadMessage, setUploadMessage] = useState("");
  const activeUpload = useRef<ResumableUploadHandle["upload"] | null>(null);
  const isUploadBusy = uploadStage !== "idle";

  function resetUploadForm() {
    setTitle("");
    setCategory("Marketing");
    setDescription("");
    setTags("");
    setFile(null);
    setError("");
    setUploadProgress(0);
    setUploadedBytes(0);
    setTotalBytes(0);
    setUploadMessage("");
    activeUpload.current = null;
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanTags = tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    if (!cleanTitle) {
      setError("Enter a video title.");
      return;
    }
    if (!file) {
      setError("Choose a video file to upload.");
      return;
    }
    const fileValidation = validateAiMediaFile(file);
    if (!fileValidation.ok) {
      setError(fileValidation.error);
      return;
    }

    setUploadStage("uploading");
    setUploadProgress(0);
    setUploadedBytes(0);
    setTotalBytes(file.size);
    setUploadMessage("Preparing resumable upload…");
    setError("");

    const supabase = createClient();
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const storagePath = `${currentUserId}/${crypto.randomUUID()}-${safeName}`;

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Your session expired. Sign in again before uploading.");
      }

      const uploadHandle = createResumableAiMediaUpload({
        accessToken: session.access_token,
        file,
        mimeType: fileValidation.mimeType,
        storagePath,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
        onProgress: (bytesSent, bytesTotal) => {
          setUploadedBytes(bytesSent);
          setTotalBytes(bytesTotal);
          setUploadProgress(
            bytesTotal > 0 ? Math.min(100, Math.round((bytesSent / bytesTotal) * 100)) : 0,
          );
        },
        onResumeFound: () => {
          setUploadMessage("Previous progress found. Resuming where it stopped…");
        },
      });

      activeUpload.current = uploadHandle.upload;
      await uploadHandle.start();
      const uploadedStoragePath = await uploadHandle.completed;

      setUploadProgress(100);
      setUploadedBytes(file.size);
      setUploadStage("saving");
      setUploadMessage("Upload complete. Saving video details…");

      const result = await createAiMediaAsset({
        title: cleanTitle,
        category,
        description,
        tags: cleanTags,
        storagePath: uploadedStoragePath,
        fileName: file.name,
        mimeType: fileValidation.mimeType,
        fileSizeBytes: file.size,
      });

      if (!result.ok) {
        await supabase.storage.from(AI_MEDIA_BUCKET).remove([uploadedStoragePath]);
        setError(result.error);
        return;
      }

      setItems((current) => [result.data, ...current]);
      setFeedback(`${cleanTitle} was uploaded to the Media Library.`);
      setIsUploadOpen(false);
      resetUploadForm();
    } catch (uploadError) {
      const message =
        uploadError instanceof Error
          ? uploadError.message
          : "The resumable upload could not be completed.";
      setError(`Could not upload the video: ${message}`);
    } finally {
      activeUpload.current = null;
      setUploadStage("idle");
    }
  }

  async function pauseUpload() {
    if (uploadStage !== "uploading" || !activeUpload.current) return;

    try {
      await activeUpload.current.abort();
      setUploadStage("paused");
      setUploadMessage("Upload paused. Resume when you are ready.");
    } catch {
      setError("The upload could not be paused. It may have already completed.");
    }
  }

  function resumeUpload() {
    if (uploadStage !== "paused" || !activeUpload.current) return;
    setUploadStage("uploading");
    setUploadMessage("Resuming upload…");
    activeUpload.current.start();
  }

  function handleDemoDownload(item: AiMediaItem) {
    setFeedback(
      `${item.title} is a sample record without a stored video file.`,
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Media Library
          </h1>
          <p className="text-sm text-muted-foreground">
            Share, preview, and download AI-generated videos created by the team.
          </p>
        </div>

        <Dialog
          open={isUploadOpen}
          onOpenChange={(open) => {
            if (!open && isUploadBusy) return;
            setIsUploadOpen(open);
            if (!open) resetUploadForm();
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Upload className="h-4 w-4" />
              Upload video
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Upload AI-generated video</DialogTitle>
              <DialogDescription>
                Add the video details and choose a local file.
              </DialogDescription>
            </DialogHeader>

            <form className="space-y-5" onSubmit={handleUpload}>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="mediaTitle">Video title</Label>
                  <Input
                    id="mediaTitle"
                    value={title}
                    onChange={(event) => {
                      setTitle(event.target.value);
                      setError("");
                    }}
                    placeholder="e.g. Product launch teaser"
                    autoFocus
                    disabled={isUploadBusy}
                    required
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="mediaCategory">Category</Label>
                  <select
                    id="mediaCategory"
                    className={selectClassName}
                    value={category}
                    disabled={isUploadBusy}
                    onChange={(event) =>
                      setCategory(event.target.value as AiMediaCategory)
                    }
                  >
                    {AI_MEDIA_CATEGORIES.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="mediaDescription">Description</Label>
                  <Textarea
                    id="mediaDescription"
                    value={description}
                    disabled={isUploadBusy}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Briefly describe the video and how the team should use it."
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="mediaTags">AI tags</Label>
                  <div className="relative">
                    <Tag className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="mediaTags"
                      className="pl-9"
                      value={tags}
                      disabled={isUploadBusy}
                      onChange={(event) => setTags(event.target.value)}
                      placeholder="AI, Product, Customer"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Separate tags with commas.
                  </p>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="mediaFile">Video file</Label>
                  <Input
                    id="mediaFile"
                    type="file"
                    accept={AI_MEDIA_FILE_ACCEPT}
                    disabled={isUploadBusy}
                    onChange={(event) => {
                      const selectedFile = event.target.files?.[0] ?? null;
                      setFile(selectedFile);
                      setUploadProgress(0);
                      setUploadedBytes(0);
                      setTotalBytes(selectedFile?.size ?? 0);
                      if (!selectedFile) {
                        setError("");
                        return;
                      }
                      const validation = validateAiMediaFile(selectedFile);
                      setError(validation.ok ? "" : validation.error);
                    }}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    {AI_MEDIA_SUPPORTED_FORMATS_LABEL} · Maximum {AI_MEDIA_MAX_FILE_SIZE_LABEL}.
                    Uploads use resumable chunks and are stored privately in the{" "}
                    {AI_MEDIA_BUCKET} bucket.
                  </p>
                  {file ? (
                    <p className="break-all text-xs font-medium">
                      {file.name} · {formatBytes(file.size)}
                    </p>
                  ) : null}
                </div>
              </div>

              {isUploadBusy ? (
                <div
                  className="space-y-2 rounded-lg border bg-muted/30 p-4"
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">
                      {uploadStage === "paused"
                        ? "Upload paused"
                        : uploadStage === "saving"
                          ? "Saving video details"
                          : "Uploading video"}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {uploadProgress}%
                    </span>
                  </div>
                  <Progress
                    value={uploadProgress}
                    aria-label="Video upload progress"
                    aria-valuetext={`${uploadProgress}% uploaded`}
                  />
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(uploadedBytes)} of {formatBytes(totalBytes)} · {uploadMessage}
                  </p>
                </div>
              ) : null}

              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}

              <DialogFooter className="border-t pt-5">
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isUploadBusy}>
                    Cancel
                  </Button>
                </DialogClose>
                {uploadStage === "uploading" ? (
                  <Button type="button" variant="outline" onClick={pauseUpload}>
                    <Pause className="h-4 w-4" />
                    Pause
                  </Button>
                ) : null}
                {uploadStage === "paused" ? (
                  <Button type="button" variant="outline" onClick={resumeUpload}>
                    <Play className="h-4 w-4" />
                    Resume
                  </Button>
                ) : null}
                <Button type="submit" disabled={isUploadBusy}>
                  <Upload className="h-4 w-4" />
                  {uploadStage === "saving" ? "Saving…" : "Upload video"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {feedback ? (
        <div
          className="flex items-start gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {feedback}
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Team videos</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {items.length} AI-generated {items.length === 1 ? "video" : "videos"}
            </p>
          </div>
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Video</th>
                  <th className="pb-2 pr-4 font-medium">Category</th>
                  <th className="pb-2 pr-4 font-medium">Created By</th>
                  <th className="pb-2 pr-4 font-medium">AI Tags</th>
                  <th className="pb-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <FileVideo className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium">{item.title}</p>
                          <p className="max-w-56 truncate text-xs text-muted-foreground">
                            {item.fileName}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4">{item.category}</td>
                    <td className="py-3 pr-4">{item.createdBy}</td>
                    <td className="py-3 pr-4">
                      <div className="flex max-w-64 flex-wrap gap-1.5">
                        {item.tags.length > 0 ? (
                          item.tags.map((tag) => (
                            <Badge key={tag} variant="secondary">
                              {tag}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">No tags</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3">
                      <MediaActions
                        item={item}
                        onPreview={() => setPreviewItem(item)}
                        onDemoDownload={() => handleDemoDownload(item)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {items.map((item) => (
              <li key={item.id} className="rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <FileVideo className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.category} · {item.createdBy}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {item.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                  <MediaActions
                    item={item}
                    onPreview={() => setPreviewItem(item)}
                    onDemoDownload={() => handleDemoDownload(item)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(previewItem)}
        onOpenChange={(open) => {
          if (!open) setPreviewItem(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          {previewItem ? (
            <>
              <DialogHeader>
                <DialogTitle>{previewItem.title}</DialogTitle>
                <DialogDescription>
                  {previewItem.category} · Created by {previewItem.createdBy}
                </DialogDescription>
              </DialogHeader>

              {!previewItem.isDemo ? (
                <video
                  className="aspect-video w-full rounded-lg bg-black"
                  src={`/ai-media/files/${previewItem.id}`}
                  controls
                  preload="metadata"
                >
                  Your browser does not support video playback.
                </video>
              ) : (
                <div className="flex aspect-video flex-col items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 via-muted to-primary/5 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background/90 text-primary shadow-sm">
                    <PlayCircle className="h-9 w-9" />
                  </div>
                  <p className="mt-4 font-medium">Demo video preview</p>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    This sample row does not include an uploaded video file.
                  </p>
                </div>
              )}

              <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">File</p>
                  <p className="mt-1 break-all font-medium">{previewItem.fileName}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Description</p>
                  <p className="mt-1 leading-6">{previewItem.description}</p>
                </div>
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Close
                  </Button>
                </DialogClose>
                {!previewItem.isDemo ? (
                  <Button asChild>
                    <a href={`/ai-media/files/${previewItem.id}?download=1`}>
                      <Download className="h-4 w-4" />
                      Download video
                    </a>
                  </Button>
                ) : (
                  <Button type="button" onClick={() => handleDemoDownload(previewItem)}>
                    <Download className="h-4 w-4" />
                    Download video
                  </Button>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MediaActions({
  item,
  onPreview,
  onDemoDownload,
}: {
  item: AiMediaItem;
  onPreview: () => void;
  onDemoDownload: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" size="sm" variant="outline" onClick={onPreview}>
        <PlayCircle className="h-4 w-4" />
        Preview
      </Button>
      {!item.isDemo ? (
        <Button asChild size="sm" variant="outline">
          <a href={`/ai-media/files/${item.id}?download=1`}>
            <Download className="h-4 w-4" />
            Download
          </a>
        </Button>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={onDemoDownload}>
          <Download className="h-4 w-4" />
          Download
        </Button>
      )}
    </div>
  );
}

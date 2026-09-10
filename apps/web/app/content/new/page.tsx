"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  explainRtkError,
  useCreateContentItemMutation,
  usePatchContentItemMutation,
  useContentCategoriesQuery,
  useContentTagsQuery,
  useCreateContentCategoryMutation,
  useUploadContentMediaMutation,
} from "@/lib/redux/api";
import { mediaUrl } from "@/lib/media-url";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { BlockNoteEditorComponent } from "@/components/content-editor/block-note-editor";
import type { BodyDocument } from "@nnact/shared";
import { Plus, Check } from "lucide-react";

const TYPES = [
  { value: "ARTICLE", label: "Article" },
  { value: "MAINTENANCE_TIP", label: "Maintenance Tip" },
  { value: "FIELD_STORY", label: "Field Story" },
  { value: "PROJECT_SHOWCASE", label: "Project Showcase" },
  { value: "ANNOUNCEMENT", label: "Announcement" },
  { value: "CAMPAIGN", label: "Campaign" },
  { value: "VIDEO", label: "Video" },
  { value: "SOCIAL_POST", label: "Social Post" },
];

export default function NewContentPage() {
  const router = useRouter();
  const [createContent, { isLoading }] = useCreateContentItemMutation();
  const [patchContent] = usePatchContentItemMutation();
  const [uploadMedia, { isLoading: uploading }] = useUploadContentMediaMutation();
  const { data: categories } = useContentCategoriesQuery();
  const { data: tags } = useContentTagsQuery();
  const [createCategory, { isLoading: creatingCategory }] = useCreateContentCategoryMutation();

  const [type, setType] = useState("ARTICLE");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [document, setDocument] = useState<BodyDocument | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [visibility, setVisibility] = useState("PUBLIC");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [featuredMediaId, setFeaturedMediaId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categoryDraftOpen, setCategoryDraftOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");

  const handleUploadImages = useCallback(
    async (files: File[]): Promise<string[]> => {
      const ids: string[] = [];
      for (const file of files) {
        try {
          const created = await uploadMedia(file).unwrap();
          ids.push(created.id);
        } catch (err) {
          console.error("image upload failed", err);
        }
      }
      return ids;
    },
    [uploadMedia],
  );

  const uploadCover = async (file: File) => {
    try {
      const created = await uploadMedia(file).unwrap();
      setFeaturedMediaId(created.id);
    } catch (err) {
      setError(explainRtkError(err, "Cover upload failed"));
    }
  };

  const handleCreateCategory = async () => {
    const name = categoryDraft.trim();
    if (!name) return;
    try {
      const created = await createCategory({ name }).unwrap();
      setCategoryId(created.id);
      setCategoryDraft("");
      setCategoryDraftOpen(false);
    } catch (err) {
      setError(explainRtkError(err, "Failed to create category"));
    }
  };

  const handleSubmit = async () => {
    setError(null);
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    try {
      const created = await createContent({
        type,
        title: title.trim(),
        summary: summary.trim() || null,
        bodyDocument: document,
        categoryId: categoryId || null,
        visibility,
        tagNames: selectedTags,
      }).unwrap();
      if (featuredMediaId) {
        await patchContent({ id: created.id, data: { featuredMediaId } }).unwrap();
      }
      router.push(`/content/${created.id}`);
    } catch (err) {
      setError(explainRtkError(err, "Failed to create content. Check permissions and try again."));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="New Content" description="Draft a new piece of content to distribute across your channels" />

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <div className="grid gap-2">
                <Label>Title *</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Catchy, descriptive headline" className="text-lg font-medium" />
              </div>

              <div className="grid gap-2">
                <Label>Body Content</Label>
                <BlockNoteEditorComponent
                  onChange={(doc) => setDocument(doc)}
                  onUploadImages={handleUploadImages}
                  placeholder="Start writing, or type / for blocks…"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Summary</Label>
                <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Short summary shown in cards and previews" />
              </div>

              <div className="grid gap-2">
                <Label>Category</Label>
                {categoryDraftOpen ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={categoryDraft}
                      onChange={(e) => setCategoryDraft(e.target.value)}
                      placeholder="New category name"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleCreateCategory();
                        if (e.key === "Escape") setCategoryDraftOpen(false);
                      }}
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="shrink-0"
                      disabled={!categoryDraft.trim() || creatingCategory}
                      onClick={() => void handleCreateCategory()}
                      title="Create category"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Select value={categoryId} onValueChange={setCategoryId}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Optional category" /></SelectTrigger>
                      <SelectContent>
                        {(categories ?? []).length === 0 && (
                          <div className="px-2 py-1.5 text-sm text-fg-muted">No categories yet — add one</div>
                        )}
                        {(categories ?? []).map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => setCategoryDraftOpen(true)}
                      title="New category"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid gap-2">
                <Label>Tags</Label>
                <MultiSelect
                  options={(tags ?? []).map((t) => ({ label: t.name, value: t.name }))}
                  selected={selectedTags}
                  onChange={setSelectedTags}
                  placeholder={(tags ?? []).length === 0 ? "Type to create a tag…" : "Select tags"}
                  allowCreate
                  onCreate={(value) => {
                    setSelectedTags((prev) => (prev.includes(value) ? prev : [...prev, value]));
                  }}
                />
              </div>

              <div className="grid gap-2">
                <Label>Featured image (optional)</Label>
                {featuredMediaId ? (
                  <div className="relative overflow-hidden rounded-lg border border-border">
                    <img src={mediaUrl(featuredMediaId) ?? ""} alt="" className="aspect-video w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setFeaturedMediaId(null)}
                      className="absolute right-1.5 top-1.5 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium text-fg border border-border"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-border text-xs text-fg-muted">
                    No cover yet
                  </div>
                )}
                <label className="relative inline-flex">
                  <Button variant="outline" size="sm" asChild>
                    <span>{uploading ? "Uploading…" : "Upload cover"}</span>
                  </Button>
                  <input
                    type="file"
                    accept="image/*"
                    className="absolute inset-0 cursor-pointer opacity-0"
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadCover(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>

              <div className="grid gap-2">
                <Label>Visibility</Label>
                <Select value={visibility} onValueChange={setVisibility}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PUBLIC">Public</SelectItem>
                    <SelectItem value="UNLISTED">Unlisted</SelectItem>
                    <SelectItem value="PRIVATE">Private</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => router.push("/content")}>Cancel</Button>
            <Button onClick={handleSubmit} loading={isLoading}>Create Draft</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCreateContentItemMutation, useContentCategoriesQuery, useContentTagsQuery } from "@/lib/redux/api";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { BlockNoteEditorComponent } from "@/components/content-editor/block-note-editor";
import type { BodyDocument } from "@nnact/shared";

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
  const { data: categories } = useContentCategoriesQuery();
  const { data: tags } = useContentTagsQuery();

  const [type, setType] = useState("ARTICLE");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [document, setDocument] = useState<BodyDocument | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [visibility, setVisibility] = useState("PUBLIC");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

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
      router.push(`/content/${created.id}`);
    } catch {
      setError("Failed to create content. Check permissions and try again.");
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
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger><SelectValue placeholder="Optional category" /></SelectTrigger>
                  <SelectContent>
                    {(categories ?? []).map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Tags</Label>
                <MultiSelect
                  options={(tags ?? []).map((t) => ({ label: t.name, value: t.name }))}
                  selected={selectedTags}
                  onChange={setSelectedTags}
                  placeholder="Select tags"
                />
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

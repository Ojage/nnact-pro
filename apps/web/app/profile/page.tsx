"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useSessionUser } from "@/lib/use-session-user";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LimitedTextarea } from "@/components/ui/limited-textarea";
import { UserAvatar } from "@/components/user-avatar";

const ABOUT_MAX = 500;

export default function ProfilePage() {
  const { user, loading, refreshUser } = useSessionUser();
  const [titleDraft, setTitleDraft] = useState("");
  const [aboutDraft, setAboutDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setTitleDraft(user.title ?? "");
      setAboutDraft(user.about ?? "");
    }
  }, [user?.id, user?.title, user?.about]);

  if (loading || !user) return null;

  const dirty = titleDraft.trim() !== (user.title ?? "") || aboutDraft.trim() !== (user.about ?? "");

  const saveDetails = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.patchUser(user.id, {
        title: titleDraft.trim() || null,
        about: aboutDraft.trim() || null,
      });
      await refreshUser();
      setTitleDraft(updated.title ?? "");
      setAboutDraft(updated.about ?? "");
      setNotice("Profile updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  };

  const changePhoto = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.uploadUserAvatar(user.id, file);
      await refreshUser();
      setTitleDraft(updated.title ?? "");
      setAboutDraft(updated.about ?? "");
      setNotice("Profile picture updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the photo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removePhoto = async () => {
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      await api.deleteUserAvatar(user.id);
      await refreshUser();
      setNotice("Profile picture removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the photo.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="My profile"
        description="Your photo appears across dispatch, job records and the team directory. Members edit their own profile; identity details are managed by an owner."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Profile photo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-4">
              <UserAvatar name={user.name} src={user.profilePictureUrl} size="xl" />
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" size="sm" variant="secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? "Uploading…" : user.profilePictureUrl ? "Change photo" : "Upload photo"}
                </Button>
                {user.profilePictureUrl ? (
                  <Button type="button" size="sm" variant="ghost" disabled={uploading} onClick={() => void removePhoto()}>
                    Remove
                  </Button>
                ) : null}
              </div>
              <p className="text-center text-xs text-fg-dim">Square images work best. PNG, JPEG or WebP, up to 2 MB.</p>
              <input
                ref={fileRef}
                type="file"
                hidden
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void changePhoto(file);
                }}
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>About you</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-dim">Job title</p>
                <Input
                  value={titleDraft}
                  placeholder="e.g. Senior technician"
                  maxLength={120}
                  onChange={(event) => setTitleDraft(event.target.value)}
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-dim">About</p>
                <LimitedTextarea
                  value={aboutDraft}
                  maxLength={ABOUT_MAX}
                  placeholder="A short introduction used across the team directory."
                  rows={4}
                  onChange={(event) => setAboutDraft(event.target.value)}
                />
              </div>
              <div className="flex items-center gap-3">
                <Button type="button" onClick={() => void saveDetails()} disabled={busy || !dirty}>
                  {busy ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Identity</CardTitle>
              <p className="text-sm text-fg-muted">Managed by an owner in Settings → Team.</p>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-dim">Name</p>
                <p className="text-sm text-fg">{user.name}</p>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-dim">Email</p>
                <p className="text-sm text-fg">{user.email}</p>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-dim">Role</p>
                <p className="text-sm capitalize text-fg">{user.role || "team member"}</p>
              </div>
            </CardContent>
          </Card>

          {(notice || error) && (
            <p aria-live="polite" role={error ? "alert" : "status"} className={`text-sm ${error ? "text-red" : "text-green"}`}>
              {error ?? notice}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
"use client";

import { useState } from "react";
import { PASSWORD_MIN_LENGTH, validatePasswordStrength } from "@nnact/shared";
import { changePassword } from "@/lib/api";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SessionUser } from "@/lib/use-session-user";

export function RequiredPasswordChange({
  user,
  onComplete,
}: {
  user: SessionUser;
  onComplete: (next: SessionUser) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const strengthError = validatePasswordStrength(newPassword);
    if (strengthError) {
      setError(strengthError);
      return;
    }
    setSubmitting(true);
    try {
      const result = await changePassword(currentPassword, newPassword);
      onComplete({
        ...user,
        mustChangePassword: false,
        ...result.user,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update password";
      if (message.includes("current password")) {
        setError("Your current password is incorrect.");
      } else if (message.includes("400")) {
        setError("Choose a stronger password (12+ characters with letters and numbers).");
      } else {
        setError("Could not update your password. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-surface-100/95 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader>
          <CardTitle>Set your password</CardTitle>
          <p className="text-sm text-fg-muted">
            Welcome, {user.name}. Your owner shared a temporary password — replace it now before using NNACT Pro.
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(event) => void submit(event)}>
            <div className="space-y-1.5">
              <label htmlFor="current-password" className="text-xs font-medium text-fg-muted">
                Temporary password
              </label>
              <PasswordInput
                id="current-password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="new-password" className="text-xs font-medium text-fg-muted">
                New password
              </label>
              <PasswordInput
                id="new-password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                minLength={PASSWORD_MIN_LENGTH}
              />
              <p className="text-xs text-fg-dim">
                At least {PASSWORD_MIN_LENGTH} characters with letters and numbers.
              </p>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-red">{error}</p>
            ) : null}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Saving…" : "Save and continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

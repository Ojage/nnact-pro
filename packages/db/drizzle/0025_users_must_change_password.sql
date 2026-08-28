-- Team members created by an owner get a provisional password and must change it on first login.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

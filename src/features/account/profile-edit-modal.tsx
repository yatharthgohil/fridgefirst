"use client";

import React, { useState } from "react";
import { Button, Icon } from "@/components";
import { UserProfile } from "./types";

export interface ProfileEditModalProps {
  isOpen: boolean;
  profile: UserProfile;
  onClose: () => void;
  onSave: (updatedProfile: UserProfile) => void;
}

export function ProfileEditModal({
  isOpen,
  profile,
  onClose,
  onSave,
}: ProfileEditModalProps) {
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [password, setPassword] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name: name.trim(),
      email: email.trim(),
      password: password || profile.password,
    });
    onClose();
  };

  return (
    <div
      className="modal-backdrop profile-edit-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <form
        className="profile-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-edit-title"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <header className="profile-edit-header">
          <div>
            <span className="review-step">
              <Icon name="users" size={15} /> Account details
            </span>
            <h2 id="profile-edit-title">Edit profile</h2>
            <p>Update the details you use to access FridgeFirst.</p>
          </div>
          <Button
            type="button"
            variant="icon"
            onClick={onClose}
            aria-label="Close profile editor"
          >
            <Icon name="close" />
          </Button>
        </header>

        <div className="profile-edit-fields">
          <label>
            <span>Full name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              autoFocus
            />
          </label>
          <label>
            <span>Email address</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            <span>New password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank to keep current password"
              autoComplete="new-password"
              minLength={8}
            />
            <small>Use at least 8 characters.</small>
          </label>
        </div>

        <footer className="profile-edit-footer">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">
            <Icon name="check" size={16} /> Save profile
          </Button>
        </footer>
      </form>
    </div>
  );
}

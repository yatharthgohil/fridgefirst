"use client";

import React, { useState } from "react";
import { Modal, Button, Icon } from "@/components";
import { StorageLocation } from "@/features/pantry/types";
import { UserProfile, NotificationSettings } from "./types";

export interface AccountSettingsModalProps {
  isOpen: boolean;
  profile: UserProfile;
  onClose: () => void;
  onEditProfileClick: () => void;
  onSaveNotice?: (msg: string) => void;
}

export function AccountSettingsModal({
  isOpen,
  profile,
  onClose,
  onEditProfileClick,
  onSaveNotice,
}: AccountSettingsModalProps) {
  const [notifications, setNotifications] = useState<NotificationSettings>({
    expiryAlerts: true,
    recipeReminders: true,
    inventoryUpdates: true,
    weeklySummary: false,
    emailNotifications: true,
    pushNotifications: true,
  });
  const [alertTiming, setAlertTiming] = useState("2 days before");
  const [measurementUnit, setMeasurementUnit] = useState<"Metric" | "US customary">("Metric");
  const [defaultStorage, setDefaultStorage] = useState<StorageLocation>("Fridge");

  const toggleNotification = (key: keyof NotificationSettings) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const profileInitials = profile.name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleSave = () => {
    onSaveNotice?.("Settings saved");
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="settings-modal"
      titleId="settings-title"
    >
      <header className="settings-header">
        <div>
          <span className="review-step">
            <Icon name="settings" size={15} /> Account preferences
          </span>
          <h2 id="settings-title">Settings</h2>
          <p>Manage alerts, account preferences, and how FridgeFirst works for you.</p>
        </div>
        <Button variant="icon" onClick={onClose} aria-label="Close settings">
          <Icon name="close" />
        </Button>
      </header>

      <div className="settings-scroll">
        <section className="settings-section account-settings-card">
          <div className="settings-section-heading">
            <span className="settings-section-icon">
              <Icon name="users" size={18} />
            </span>
            <div>
              <strong>Account</strong>
              <p>Your profile and sign-in information.</p>
            </div>
          </div>
          <div className="account-settings-row">
            <div className="avatar">{profileInitials}</div>
            <div>
              <strong>{profile.name}</strong>
              <span>{profile.email}</span>
            </div>
            <Button variant="secondary" onClick={onEditProfileClick}>
              Edit profile
            </Button>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-heading">
            <span className="settings-section-icon">
              <Icon name="bell" size={18} />
            </span>
            <div>
              <strong>Notifications</strong>
              <p>Choose which pantry updates you want to receive.</p>
            </div>
          </div>
          <div className="settings-list">
            <label className="settings-switch-row">
              <div>
                <strong>Expiration alerts</strong>
                <span>Get notified before food is likely to spoil.</span>
              </div>
              <input
                type="checkbox"
                checked={notifications.expiryAlerts}
                onChange={() => toggleNotification("expiryAlerts")}
              />
              <span className="toggle-track">
                <i />
              </span>
            </label>
            {notifications.expiryAlerts && (
              <label className="inline-setting">
                <span>Notify me</span>
                <select
                  value={alertTiming}
                  onChange={(e) => setAlertTiming(e.target.value)}
                >
                  <option>1 day before</option>
                  <option>2 days before</option>
                  <option>3 days before</option>
                  <option>5 days before</option>
                </select>
              </label>
            )}
            <label className="settings-switch-row">
              <div>
                <strong>Recipe reminders</strong>
                <span>Suggestions when several ingredients need using soon.</span>
              </div>
              <input
                type="checkbox"
                checked={notifications.recipeReminders}
                onChange={() => toggleNotification("recipeReminders")}
              />
              <span className="toggle-track">
                <i />
              </span>
            </label>
            <label className="settings-switch-row">
              <div>
                <strong>Inventory updates</strong>
                <span>Confirmations when pantry quantities change.</span>
              </div>
              <input
                type="checkbox"
                checked={notifications.inventoryUpdates}
                onChange={() => toggleNotification("inventoryUpdates")}
              />
              <span className="toggle-track">
                <i />
              </span>
            </label>
            <label className="settings-switch-row">
              <div>
                <strong>Weekly waste summary</strong>
                <span>A weekly recap of food used and rescued.</span>
              </div>
              <input
                type="checkbox"
                checked={notifications.weeklySummary}
                onChange={() => toggleNotification("weeklySummary")}
              />
              <span className="toggle-track">
                <i />
              </span>
            </label>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-heading">
            <span className="settings-section-icon">
              <Icon name="history" size={18} />
            </span>
            <div>
              <strong>Notification channels</strong>
              <p>Choose where FridgeFirst should contact you.</p>
            </div>
          </div>
          <div className="channel-grid">
            <label className={notifications.emailNotifications ? "selected" : ""}>
              <input
                type="checkbox"
                checked={notifications.emailNotifications}
                onChange={() => toggleNotification("emailNotifications")}
              />
              <span>
                <Icon name="check" size={13} />
              </span>
              <div>
                <strong>Email</strong>
                <small>{profile.email}</small>
              </div>
            </label>
            <label className={notifications.pushNotifications ? "selected" : ""}>
              <input
                type="checkbox"
                checked={notifications.pushNotifications}
                onChange={() => toggleNotification("pushNotifications")}
              />
              <span>
                <Icon name="check" size={13} />
              </span>
              <div>
                <strong>Push notifications</strong>
                <small>This browser</small>
              </div>
            </label>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-heading">
            <span className="settings-section-icon">
              <Icon name="pantry" size={18} />
            </span>
            <div>
              <strong>Pantry preferences</strong>
              <p>Defaults used throughout your inventory.</p>
            </div>
          </div>
          <div className="settings-select-grid">
            <label>
              <span>Measurement system</span>
              <select
                value={measurementUnit}
                onChange={(e) =>
                  setMeasurementUnit(e.target.value as "Metric" | "US customary")
                }
              >
                <option value="Metric">Metric</option>
                <option value="US customary">US customary</option>
              </select>
            </label>
            <label>
              <span>Default storage</span>
              <select
                value={defaultStorage}
                onChange={(e) => setDefaultStorage(e.target.value as StorageLocation)}
              >
                <option value="Fridge">Fridge</option>
                <option value="Pantry">Pantry</option>
                <option value="Freezer">Freezer</option>
                <option value="Counter">Counter</option>
              </select>
            </label>
          </div>
        </section>
      </div>

      <footer className="settings-footer">
        <Button
          variant="ghost"
          className="danger-link"
          onClick={() =>
            onSaveNotice?.("Account deletion requires email confirmation")
          }
        >
          Delete account
        </Button>
        <div>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save settings</Button>
        </div>
      </footer>
    </Modal>
  );
}

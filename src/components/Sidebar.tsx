"use client";

import React, { useState } from "react";
import { Icon, IconName } from "./Icon";
import { Button } from "./Button";

export interface SidebarProps {
  activeNav: string;
  onNavigate: (nav: string) => void;
  pantryCount?: number;
  recipesCount?: number;
  user?: {
    name: string;
    email: string;
  };
  monthlySavedKg?: number;
  monthlyGoalKg?: number;
  onOpenSettings: () => void;
  onSignOut?: () => void;
}

export function Sidebar({
  activeNav,
  onNavigate,
  pantryCount = 12,
  recipesCount = 6,
  user = { name: "Alex Johnson", email: "alex@example.com" },
  monthlySavedKg = 3.2,
  monthlyGoalKg = 5.0,
  onOpenSettings,
  onSignOut,
}: SidebarProps) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const goalProgress = Math.min(
    100,
    Math.round((monthlySavedKg / monthlyGoalKg) * 100)
  );

  const profileInitials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const navItems: [string, IconName, number?][] = [
    ["Overview", "home"],
    ["My pantry", "pantry", pantryCount],
    ["Recipes", "recipes", recipesCount],
    ["Activity", "history"],
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <img className="brand-logo" src="/fridgefirst-leaves.png" alt="" />
        <strong>FridgeFirst</strong>
      </div>

      <nav className="nav-list" aria-label="Main navigation">
        {navItems.map(([label, icon, count]) => (
          <Button
            key={label}
            variant="ghost"
            className={`nav-item ${activeNav === label ? "active" : ""}`}
            onClick={() => onNavigate(label)}
          >
            <Icon name={icon} />
            <span>{label}</span>
            {typeof count === "number" && (
              <span className="nav-count">{count}</span>
            )}
          </Button>
        ))}
      </nav>

      <div className="sidebar-spacer" />

      <div className="waste-card">
        <div className="waste-art">
          <span className="mini-leaf a" />
          <span className="mini-leaf b" />
          <span className="mini-leaf c" />
        </div>
        <span className="eyebrow">THIS MONTH</span>
        <strong>{monthlySavedKg.toFixed(1)} kg saved</strong>
        <p>You’ve kept 14 meals out of the bin so far.</p>
        <div className="progress">
          <span style={{ width: `${goalProgress}%` }} />
        </div>
        <small>{goalProgress}% of your monthly goal</small>
      </div>

      <div className="profile-wrap">
        {profileMenuOpen && (
          <div className="profile-menu" role="menu">
            <div className="profile-menu-account">
              <div className="avatar">{profileInitials}</div>
              <div>
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </div>
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                setProfileMenuOpen(false);
                onOpenSettings();
              }}
            >
              <Icon name="settings" size={16} /> Settings
            </Button>
            <div className="profile-menu-divider" />
            <Button
              variant="ghost"
              className="sign-out-button"
              onClick={() => {
                setProfileMenuOpen(false);
                onSignOut?.();
              }}
            >
              <Icon name="arrow" size={17} /> Sign out
            </Button>
          </div>
        )}

        <Button
          variant="ghost"
          className={`profile ${profileMenuOpen ? "open" : ""}`}
          onClick={() => setProfileMenuOpen((open) => !open)}
          aria-expanded={profileMenuOpen}
          aria-label="Account menu"
        >
          <div className="avatar">{profileInitials}</div>
          <div>
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <Icon name="chevron" size={16} />
        </Button>
      </div>
    </aside>
  );
}

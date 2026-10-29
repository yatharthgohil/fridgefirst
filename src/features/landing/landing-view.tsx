"use client";

import React from "react";
import { Button, Icon } from "@/components";

export interface LandingViewProps {
  onGetStarted: () => void;
  onSignIn: () => void;
}

export function LandingView({ onGetStarted, onSignIn }: LandingViewProps) {
  return (
    <div className="welcome-site">
      <header className="welcome-nav">
        <Button variant="ghost" className="welcome-brand">
          <img className="brand-logo" src="/fridgefirst-leaves.png" alt="" />
          <span>
            <strong>Fridge</strong>First
          </span>
        </Button>
        <div>
          <Button variant="ghost" onClick={onSignIn}>
            Sign in
          </Button>
          <Button onClick={onGetStarted}>Create account</Button>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-copy">
            <span className="landing-eyebrow">
              <Icon name="sparkle" size={15} /> Your food, used thoughtfully
            </span>
            <h1>
              Cook what you have.
              <br />
              Waste less of it.
            </h1>
            <p>
              FridgeFirst keeps track of your groceries, brings expiring food to
              the front, and builds a smarter cooking plan around your time.
            </p>
            <div className="landing-actions">
              <Button onClick={onGetStarted}>
                Start for free <Icon name="arrow" size={17} />
              </Button>
              <Button variant="secondary" onClick={onSignIn}>
                I already have an account
              </Button>
            </div>
            <div className="landing-proof">
              <span>
                <Icon name="check" size={13} /> No credit card
              </span>
              <span>
                <Icon name="check" size={13} /> Set up in minutes
              </span>
            </div>
          </div>

          <div className="landing-visual">
            <img
              src="https://images.unsplash.com/photo-1591189863430-ab87e120f312?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmcmVzaCUyMHZlZ2V0YWJsZXMlMjBncm9jZXJpZXMlMjBraXRjaGVuJTIwY29va2luZyUyMG92ZXJoZWFkfGVufDF8fHx8MTc5MjE4NDE2N3ww&ixlib=rb-4.1.0&q=80&w=1080"
              alt="Fresh green vegetables arranged on a wooden kitchen table"
            />
            <div className="landing-photo-shade" />
            <div className="landing-inventory-card">
              <span className="landing-mini-icon">
                <Icon name="pantry" size={17} />
              </span>
              <div>
                <small>USE FIRST</small>
                <strong>Baby spinach</strong>
                <span>Use today</span>
              </div>
            </div>
            <div className="landing-plan-card">
              <div>
                <span className="live-dot" />
                <strong>Smart cooking plan</strong>
              </div>
              <p>Roast tray</p>
              <div className="landing-plan-track">
                <span />
                <i />
              </div>
              <small>Quick cleanup fits here · saves 9 min</small>
            </div>
          </div>
        </section>

        <section className="landing-features">
          <div className="landing-section-heading">
            <span className="eyebrow">BUILT FOR REAL LIFE</span>
            <h2>From grocery bag to dinner plan</h2>
            <p>Spend less time keeping lists and more time using what you already bought.</p>
          </div>
          <div className="feature-showcase">
            <article>
              <span className="feature-number">01</span>
              <span className="feature-icon camera">
                <Icon name="camera" />
              </span>
              <h3>Snap your groceries</h3>
              <p>Upload a photo, review what we detect, and add everything to your pantry in one pass.</p>
            </article>
            <article>
              <span className="feature-number">02</span>
              <span className="feature-icon expiry-feature">
                <Icon name="clock" />
              </span>
              <h3>Use the right food first</h3>
              <p>See what needs attention and get recipes ranked by expiration, pantry match, and your preferences.</p>
            </article>
            <article>
              <span className="feature-number">03</span>
              <span className="feature-icon">
                <Icon name="sparkle" />
              </span>
              <h3>Cook on a smarter timeline</h3>
              <p>Safely overlap independent prep and use inactive cooking time for quick cleanup tasks.</p>
            </article>
          </div>
        </section>

        <section className="landing-cta">
          <div>
            <span className="eyebrow">DINNER STARTS WITH WHAT YOU HAVE</span>
            <h2>Make your fridge the first place you look.</h2>
          </div>
          <Button onClick={onGetStarted}>
            Create your pantry <Icon name="arrow" size={17} />
          </Button>
        </section>
      </main>
    </div>
  );
}

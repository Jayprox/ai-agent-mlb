# Submitting Prop Scout to the Apple App Store — Step-by-Step Guide

This is a high-level but complete walkthrough of everything required to get the
Prop Scout (ai-agent-mlb) mobile app live on the App Store, from account setup
through release. Steps are ordered roughly the way you'll actually do them —
some can run in parallel (marked below).

## 1. Enroll in the Apple Developer Program

You need an active Apple Developer account to submit anything.

- Go to developer.apple.com and enroll as either an **Individual** or an
  **Organization** (Organization requires a D-U-N-S number and legal entity —
  takes longer, so start this early if you haven't already).
- Pay the $99/year membership fee.
- Wait for approval (can take anywhere from a few hours to a few days for
  Individual; longer for Organization due to D-U-N-S verification).

*Can run in parallel with Step 2 and 3.*

## 2. Decide on app identity: name, bundle ID, and SKU

- **App name**: "Prop Scout" (or whatever you want shown on the App Store —
  check it isn't taken by searching the App Store and App Store Connect).
- **Bundle identifier**: a reverse-domain string, e.g. `com.yourcompany.propscout`.
  This is permanent once you create the App ID — choose carefully.
- **SKU**: an internal-only unique identifier (e.g. `propscout-ios-001`), not
  shown to users.

## 3. Register the App ID and create the app in App Store Connect

- In the Apple Developer portal, go to **Certificates, Identifiers & Profiles**
  → **Identifiers** → register a new App ID using the bundle identifier from
  Step 2. Enable any capabilities you need (Push Notifications, etc.).
- In **App Store Connect** (appstoreconnect.apple.com) → **My Apps** → **+** →
  **New App**. Fill in: platform (iOS), name, primary language, bundle ID
  (select the one you just registered), and SKU.

## 4. Prepare app metadata and store listing content

This can be done while the build is in progress (parallel with Step 6).

- **App description** — what Prop Scout does (AI-powered MLB prop research,
  board/picks/predictions, chat assistant, etc.).
- **Keywords** for search.
- **Support URL** and **Marketing URL** (can be the same site).
- **Privacy Policy URL** — **mandatory**, no exceptions. Must accurately
  describe what data is collected (accounts/auth, any analytics, etc.).
- **Screenshots** — required for each device size you support (at minimum
  6.7" iPhone; iPad if the app supports it). Capture real screens of Board,
  Picks, Chat, Predict tabs.
- **App icon** — 1024x1024px, no transparency, no rounded corners (Apple
  applies the mask).
- **App Preview video** (optional).
- **Category** — pick the most accurate category. Given Prop Scout surfaces
  odds/lines/predictions, consider **Sports** vs **News**/**Reference** — see
  the gambling-content note in Step 9 before deciding.

## 5. Fill out App Privacy details ("Privacy Nutrition Label")

- In App Store Connect → your app → **App Privacy**, answer Apple's data
  collection questionnaire (what data types you collect — e.g. account info,
  identifiers — and what it's used for: app functionality, analytics, etc.).
  This generates the public-facing privacy label shown on your store page.
- This must match your actual Privacy Policy — mismatches are a common
  rejection reason.

## 6. Build, sign, and archive the app

- If using React Native / Expo: run `eas build --platform ios` (or your
  project's equivalent build command) targeting a release/production profile.
- Ensure the build uses:
  - The correct **bundle identifier** (matches Step 2/3).
  - A **Distribution certificate** and **App Store provisioning profile**
    (Apple Developer portal, or auto-managed by Xcode/EAS).
  - The correct **version number** (e.g. `1.0.0`) and **build number**
    (must increment for every upload, even for the same version).
- If building locally in Xcode: **Product → Archive**, then validate the
  archive before uploading.

## 7. Upload the build to App Store Connect

- Upload via Xcode Organizer ("Distribute App" → App Store Connect), or via
  `eas submit` if using Expo, or `xcrun altool` / Transporter app.
- Wait for Apple to finish processing the build (you'll get an email; usually
  10–60 minutes). Processing includes automated checks (e.g. missing icons,
  invalid Info.plist entries, export compliance).
- **Export compliance**: you'll be asked whether the app uses encryption.
  Standard HTTPS/TLS usually qualifies for an exemption — answer accordingly
  (incorrect answers can delay review).

## 8. Internal testing with TestFlight (recommended before public submission)

- In App Store Connect → **TestFlight**, add the processed build to an
  internal testing group.
- Add the `appledemo` account (already provisioned on the backend with
  `AI_PICKS_ALLOWLIST` access to Scout/Chat/HR Scout/Advisor/Lab) as a tester,
  or note its credentials in the **Notes for Review** field in Step 10 so
  Apple's reviewer can log in.
- Install via the TestFlight app and verify: login flow, all tabs (Board, AI
  Board, Picks, Predict, Chat, Scout), and that there's no crash on first
  launch — this mirrors what an App Review tester will do.

## 9. Address sports-odds / prediction content guidelines

Because Prop Scout surfaces betting lines, odds, and "picks," Apple may flag
it under guidelines for gambling-adjacent content even though it's not itself
a sportsbook. Before submitting:

- Make clear in the app (and in your review notes) that Prop Scout provides
  **research/analysis only** — it does not facilitate real-money wagering,
  account funding, or payouts.
- If the app links out to or integrates with any sportsbook, Apple may
  require **17+ age rating** and, in some regions, proof of gambling licensing
  for the *linked* operator — not for you, but reviewers sometimes still ask.
  Be ready to explain the relationship.
- Set the **Age Rating** questionnaire (App Store Connect → App Information)
  honestly — "Gambling and Contests" / "Simulated Gambling" sections apply if
  odds/lines are a core feature, even for informational use. This typically
  results in a 17+ rating, which is fine and expected for this kind of app.

## 10. Fill out the version release info and submit for review

- In App Store Connect → your app → version page:
  - Attach the processed build from Step 7.
  - Fill in **What's New in This Version** (for v1.0, a short intro is fine).
  - Set **Release options**: manual release vs. automatic release after
    approval (manual gives you control over launch timing).
  - **App Review Information**: provide a demo account (the `appledemo`
    login) and any notes explaining the app's purpose, especially the
    research-only framing from Step 9.
- Click **Add for Review**, then **Submit to App Review**.

## 11. Wait for review and respond to any rejections

- Typical review time is 24–48 hours, though it varies.
- If rejected, Apple provides a specific guideline reference and explanation
  in the **Resolution Center**. Common first-submission issues for this type
  of app: missing/incomplete privacy policy, demo account doesn't work,
  age rating mismatch with actual content, or crashes on specific devices.
- Fix the issue, optionally bump the build number, re-upload if needed, and
  resubmit (often you can reply in the Resolution Center without a new build
  for metadata-only issues).

## 12. Release

- Once approved, if you chose manual release, click **Release This Version**
  in App Store Connect.
- The app goes live on the App Store, typically within a few hours.
- After release: monitor **App Analytics** and **Crashes** in App Store
  Connect for the first few days, and watch for any new Resolution Center
  messages (Apple can still flag issues post-release).

---

**Open items to confirm before you start:** Apple Developer account status
(individual vs org, already enrolled?), final app name availability, bundle
identifier choice, and whether `appledemo` should be the App Review demo
account credentials submitted in Step 10.

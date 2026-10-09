# Note Systems — your own vault + embed page (Robinhood Chain testnet)

Two parts:
1. **`scripts/deploy-vault.ts`** — run once, deploys your own vault via the factory.
2. **`src/main.js`** + `index.html` — the public embed page users deposit through.

Uses the official `@note-systems/sdk` throughout, not hand-rolled contract
calls — it handles approval, error decoding, and binding verification for you.

## Install

```
npm install viem https://note.systems/sdk/note-systems-sdk-0.1.2.tgz
```
(already in `package.json` — Railway/Render will run this automatically
on deploy; see below for running it yourself to deploy the vault)

## IMPORTANT: decimals

USDG uses **6 decimals**. The vault's **shares** use **18 decimals**
(decimal offset 12), per the docs: "Shares have 18 decimals over a
6-decimal asset." `src/main.js` handles this correctly — deposit
amounts you type are USDG (6 decimals), balances shown are shares
(18 decimals). If you ever hand-write a raw amount, double check
which one you're in.

## Step 1 — Deploy your own vault

`scripts/deploy-vault.ts` matches the docs' own "Deploy your own
vault" example exactly — one band (AAPL), one partner (you, at 25%
fee share, matching their example value — the docs note 50% is the
max allowed per partner, so you can raise this later if you want).
Every field name and value is confirmed against the docs' Solidity
sample, including `minCouponFloorBps` and `absoluteCap` (easy to miss
— not in earlier drafts of this script). Partner id is generated with
the SDK's own `partnerId()` helper, not hand-rolled.

Worth customizing before running: `minCouponFloorBps: 5` (0.05%) is
the docs' own placeholder value, almost certainly too low for a real
vault — raise it to whatever coupon floor you actually want to offer.

### Running it from your phone

This needs an actual Node environment — Railway/Render build steps
won't help here since this is a one-time action you trigger, not
something that runs on every deploy. Two phone-friendly options:

**Option A — GitHub Codespaces (recommended):**
1. On the repo, tap **Code → Codespaces → Create codespace** (works
   in mobile browser, gives you a full VS Code + terminal in-browser).
2. In the Codespace terminal:
   ```
   npm install
   export PRIVATE_KEY=0xyour_testnet_wallet_private_key
   npm run deploy-vault
   ```
3. Copy the printed `vault` address into `CONFIG.vaultAddress` in
   `src/main.js`, commit, push.

**Option B — Railway's web shell** (if your plan includes it): deploy
this repo as a service first, then use Railway's dashboard shell to
run `npm run deploy-vault` with `PRIVATE_KEY` set as an environment
variable in the dashboard (settable from any browser).

⚠️ Use a **testnet-only** wallet key for this — never a key that
holds real funds, and never commit it to the repo. Set it as an
environment variable, every time.

## Step 2 — Point the embed page at your vault

In `src/main.js`, set:
```js
vaultAddress: "0xYourDeployedVaultAddress",
```
Leave it empty and the page will auto-discover the first vault listed
by the factory instead — fine for testing, but you want it pinned
once you have your own.

## Step 3 — Your partner id

The deploy script already registers your own partner id on your own
vault's mandate (since you're the curator — no waiting on anyone). It
uses the SDK's `partnerId("myke.partner")` helper. `src/main.js`
derives the same id from `CONFIG.partnerLabel` — just make sure the
label matches exactly between the two files (it does by default:
`"myke.partner"` in both). Change the label in both places together
if you want something else.

## What the embed page actually does now

- Connects wallet, switches to chain id 46630 automatically
- Discovers or uses your configured vault, and **refuses to proceed**
  if `verifyBinding()` fails (the docs' own recommended safety check)
- Shows your holding (`note.vaults.holding`)
- Deposit: approves USDG, then calls `note.vaults.deposit(...)` —
  tagged with your partnerId if set
- Withdraw: calls `note.vaults.requestRedeem(...)`
- Decodes known errors by name (`UnknownPartner`, `VaultPaused`,
  `BelowMinimum`, `ERC4626ExceededMaxDeposit`, `OutsideBand`,
  `Cooldown`, `NothingToClaim`, `NotRequestOwner`, `Locked`)

## Running the embed page locally (optional)

```
npm install
npm run dev
```

## Deploying the embed page

- Push to GitHub.
- Connect to Railway or Render as a Node project.
- Build: `npm run build`
- Serve: `npm run preview`, or point static hosting at `dist/`.

## Known constraints

- Fresh shares carry an exit lock (24h on the reference vault; your
  own mandate can set 1 hour to 7 days).
- Harvested coupons release into the share price gradually over 7
  days — early exits only get the released portion.
- At most 32 distinct partner ids for the life of a vault; a partner
  can be retired by setting its share to zero.
- Your protocol fee share (20% to the Note treasury) is fixed at
  vault creation and can't be changed afterward.
- Initial bands and partners are locked in at creation too — later
  changes to your mandate go through a timelocked path (`submit` then
  `execute` after the delay), except tightening changes
  (`disableBand`, `decreaseCaps`, `tightenLimits`, `lowerFees`), which
  take effect immediately.
- Notes can lose value: a barrier breach at maturity means the SHIELD
  side gets stock at its starting price, which may be worth less than
  the deposit.


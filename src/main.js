// Note Systems — vault embed, using the official @note-systems/sdk
// -------------------------------------------------------------
// IMPORTANT FIX: USDG has 6 decimals, the vault's SHARES have 18
// decimals (decimal offset 12) — per "Shares have 18 decimals over
// a 6-decimal asset" in the docs. Amounts you type/deposit are in
// USDG (6 decimals); balances shown are vault shares (18 decimals).
// -------------------------------------------------------------

import { createPublicClient, createWalletClient, custom, http, parseUnits, formatUnits } from "viem";
import { createNoteClient, NoteError, partnerId as sdkPartnerId, robinhoodTestnet } from "@note-systems/sdk";

const CONFIG = {
  rpcUrl: "https://rpc.testnet.chain.robinhood.com",
  chainId: 46630,
  usdgDecimals: 6,
  shareDecimals: 18,
  // Leave empty to auto-discover the first vault via note.factory.list().
  // Fill in once you've deployed your own vault (see scripts/deploy-vault.ts).
  vaultAddress: "0x590502a29d35ac73D2a10ce962D7a5F5A02e65DC",
  // Must match the label you used in scripts/deploy-vault.ts's partners[0].id,
  // e.g. partnerId("myke.partner") — set to null for untagged deposits (no fee share).
  partnerLabel: "myke.partner",
};
const partnerId = CONFIG.partnerLabel ? sdkPartnerId(CONFIG.partnerLabel) : null;

const el = {
  connectBtn: document.getElementById("connectBtn"),
  balanceCard: document.getElementById("balanceCard"),
  balanceValue: document.getElementById("balanceValue"),
  shareValue: document.getElementById("shareValue"),
  mandateCard: document.getElementById("mandateCard"),
  mandateText: document.getElementById("mandateText"),
  depositCard: document.getElementById("depositCard"),
  depositAmount: document.getElementById("depositAmount"),
  depositBtn: document.getElementById("depositBtn"),
  withdrawCard: document.getElementById("withdrawCard"),
  withdrawAmount: document.getElementById("withdrawAmount"),
  withdrawBtn: document.getElementById("withdrawBtn"),
  status: document.getElementById("status"),
};

let state = { address: null, note: null, vault: null };

function setStatus(msg, kind) {
  el.status.textContent = msg || "";
  el.status.className = kind || "";
}

function showPostConnectUI() {
  el.balanceCard.style.display = "block";
  el.mandateCard.style.display = "block";
  el.depositCard.style.display = "block";
  el.withdrawCard.style.display = "block";
  el.connectBtn.textContent = `Connected: ${state.address.slice(0, 6)}…${state.address.slice(-4)}`;
  el.connectBtn.disabled = true;
}

async function ensureNetwork() {
  const currentChainId = await window.ethereum.request({ method: "eth_chainId" });
  if (parseInt(currentChainId, 16) === CONFIG.chainId) return;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x" + CONFIG.chainId.toString(16) }],
    });
  } catch (switchErr) {
    if (switchErr.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0x" + CONFIG.chainId.toString(16),
          chainName: "Robinhood Chain Testnet",
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: [CONFIG.rpcUrl],
        }],
      });
    } else {
      throw switchErr;
    }
  }
}

function decodeError(err) {
  if (err instanceof NoteError && err.decoded) {
    // Known names: UnknownPartner, VaultPaused, BelowMinimum,
    // ERC4626ExceededMaxDeposit, OutsideBand, Cooldown, NothingToClaim,
    // NotRequestOwner, Locked
    return `${err.decoded.name}(${(err.decoded.args || []).join(", ")})`;
  }
  return err.shortMessage || err.message || String(err);
}

async function connectWallet() {
  setStatus("Connecting…");
  try {
    if (!window.ethereum) throw new Error("No wallet found. Install a wallet extension or open in a wallet browser.");

    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    state.address = accounts[0];

    await ensureNetwork();

    const publicClient = createPublicClient({ chain: robinhoodTestnet, transport: http(CONFIG.rpcUrl) });
    const walletClient = createWalletClient({ chain: robinhoodTestnet, transport: custom(window.ethereum), account: state.address });
    state.note = await createNoteClient({ publicClient, walletClient });

    // Resolve the vault: configured address, or auto-discover the
    // first one the factory lists.
    if (CONFIG.vaultAddress) {
      state.vault = CONFIG.vaultAddress;
    } else {
      const [vault] = await state.note.factory.list(0n, 20n);
      if (!vault) throw new Error("No vault found via factory.list() — deploy one first or set CONFIG.vaultAddress.");
      state.vault = vault;
    }

    // Safety checks the docs explicitly recommend before trusting a vault:
    const bound = await state.note.vaults.verifyBinding(state.vault);
    if (!bound) throw new Error("This vault failed verifyBinding() — registry/vault/mandate/adapter don't all point to each other. Not safe to use.");

    showPostConnectUI();
    setStatus("Connected.", "success");
    await Promise.all([refreshBalance(), refreshMandate()]);
  } catch (err) {
    setStatus(decodeError(err), "error");
  }
}

async function refreshBalance() {
  try {
    const h = await state.note.vaults.holding(state.vault, state.address);
    // h.shares, h.value, h.tagged per the docs' usage snippet
    el.balanceValue.textContent = `${formatUnits(h.value, CONFIG.usdgDecimals)} USDG`;
    el.shareValue.textContent = `${formatUnits(h.shares, CONFIG.shareDecimals)} shares`;
  } catch (err) {
    setStatus(decodeError(err), "error");
  }
}

async function refreshMandate() {
  try {
    const s = await state.note.vaults.summary(state.vault);
    // Exact shape of `summary` isn't fully confirmed from docs —
    // render defensively.
    el.mandateText.textContent = JSON.stringify(s, (_, v) => typeof v === "bigint" ? v.toString() : v, 2);
  } catch (err) {
    el.mandateText.textContent = "Could not load vault summary — " + decodeError(err);
  }
}

async function handleDeposit() {
  const amount = parseFloat(el.depositAmount.value);
  if (!amount || amount <= 0) return setStatus("Enter a valid deposit amount.", "error");

  el.depositBtn.disabled = true;
  try {
    const assets = parseUnits(String(amount), CONFIG.usdgDecimals);

    setStatus("Approving USDG spend…");
    await state.note.vaults.approve(state.vault, assets);

    setStatus("Depositing…");
    const d = await state.note.vaults.deposit({
      vault: state.vault,
      assets,
      receiver: state.address,
      ...(partnerId ? { partnerId } : {}),
    });

    console.log("deposit result:", d);
    const shares = d?.result?.shares;
    const tagged = d?.result?.tagged;
    const sharesText = typeof shares === "bigint" ? `${formatUnits(shares, CONFIG.shareDecimals)} shares` : "deposit confirmed";
    const taggedText = typeof tagged === "boolean" ? `, tagged: ${tagged}` : "";
    setStatus(`${sharesText}${taggedText}. (tx: ${d?.hash ?? "?"})`, "success");
  } catch (err) {
    setStatus(decodeError(err), "error");
  } finally {
    el.depositBtn.disabled = false;
  }

  await refreshBalance();
}

async function handleWithdraw() {
  const amount = parseFloat(el.withdrawAmount.value);
  if (!amount || amount <= 0) return setStatus("Enter a valid withdrawal amount.", "error");

  el.withdrawBtn.disabled = true;
  try {
    const shares = parseUnits(String(amount), CONFIG.shareDecimals);

    setStatus("Requesting withdrawal…");
    const r = await state.note.vaults.requestRedeem(state.vault, shares, state.address, state.address);

    setStatus(`Withdrawal requested (id ${r.id ?? "?"}). Queued fills pay out as idle quote returns — check back, or it may settle instantly depending on available idle quote.`, "success");
  } catch (err) {
    // Locked(owner, until) — inside the exit lock; NothingToClaim(id) —
    // nothing filled yet to claim.
    setStatus(decodeError(err), "error");
  } finally {
    el.withdrawBtn.disabled = false;
  }

  await refreshBalance();
}

el.connectBtn.addEventListener("click", connectWallet);
el.depositBtn.addEventListener("click", handleDeposit);
el.withdrawBtn.addEventListener("click", handleWithdraw);

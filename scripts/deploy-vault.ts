// Deploy your own Note Systems vault — run ONCE, by you, as the curator.
// -------------------------------------------------------------
// Run with: npm run deploy-vault
// (needs PRIVATE_KEY set in the environment — see README for how to
// run this from a phone via GitHub Codespaces or Railway's shell)
//
// Field names and values below are CONFIRMED against the docs' own
// "Deploy your own vault" Solidity example — no more guessed fields.
// -------------------------------------------------------------

import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createNoteClient, partnerId, robinhoodTestnet } from "@note-systems/sdk";

const RPC_URL = "https://rpc.testnet.chain.robinhood.com";

// --- Confirmed testnet addresses (from the Addresses page) ---
const AAPL_TOKEN = "0x49a6d7470694FB1D9621cA4A5215704588A87BB"; // AAPL Stock Token (mock)
const AAPL_FEED = "0x816D092d62D71A1E24E1e225a583f6FFF5978CdFE5"; // AAPL feed (mock) — double-check this one, it's long; re-copy from the Addresses page if the deploy reverts on an invalid feed address

async function main() {
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
  const publicClient = createPublicClient({ chain: robinhoodTestnet, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ chain: robinhoodTestnet, transport: http(RPC_URL), account });
  const note = await createNoteClient({ publicClient, walletClient });

  const curator = account.address; // you — becomes owner + guardian + feeRecipient by default below

  // --- Bands: which stocks this vault's mandate allows, and the rules for each ---
  const bands = [
    {
      underlying: AAPL_TOKEN,
      band: {
        enabled: true,
        feed: AAPL_FEED,
        minBarrierBps: 5_500,     // 55% barrier floor
        maxBarrierBps: 9_000,     // 90% barrier ceiling
        minCouponFloorBps: 5,     // confirmed field — docs' own example uses 5 (0.05%); likely worth raising for a real deployment, this is just their placeholder
        maxObservations: 13,
        maxTenor: 13 * 7 * 24 * 60 * 60, // 13 weeks, in seconds
        maxOpenSeries: 4,
        relativeCapBps: 3_000,    // confirmed: 30%
        absoluteCap: 50_000_000_000, // confirmed field, 50,000 USDG (6 decimals: 50_000 * 1e6)
      },
    },
  ];

  // --- Your partner id, registered for this vault at creation ---
  // partnerId() is the SDK's own helper — same keccak256(label) the
  // contracts expect, no need to hand-roll it.
  const partners = [
    {
      id: partnerId("myke.partner"), // change the label to whatever you want — just needs to be unique
      payee: curator, // where your fee share gets paid
      shareBps: 2_500, // confirmed value from the docs' own example (25%)
    },
  ];

  console.log("Deploying vault as curator:", curator);

  // NOTE: the exact SDK method name for creation wasn't directly shown
  // in the docs' usage snippet (only discovery/deposit were shown) —
  // `note.factory.create(...)` is inferred from the SDK's own
  // description ("bundling the pinned NoteVault creation code so
  // factory.create() needs no build step"). If this method doesn't
  // exist under this name, check the SDK's own README (in
  // node_modules/@note-systems/sdk after install) for the real one.
  const result = await note.factory.create({
    name: "Myke USDG Notes",      // customize
    symbol: "mykeUSDG",           // customize
    owner: curator,
    guardian: curator,            // using the same address for simplicity — can be separate
    feeRecipient: curator,
    fees: { managementBps: 50, performanceBps: 1_000 },
    limits: {
      maxSeriesBps: 2_000,
      minIdleBps: 500,
      stockHaircutBps: 1_000,
      allocateLead: 2 * 24 * 60 * 60,     // 2 days, in seconds
      minAllocation: 1_000_000_000,        // 1,000 USDG (6 decimals: 1_000 * 1e6)
      depositCap: 0,                       // 0 = uncapped, per the docs' own example
      exitLock: 24 * 60 * 60,              // 24 hours — matches the reference vault; inferred from a cut-off "24..." in the docs, high confidence but not 100% visible
    },
    mandateDelay: 3 * 24 * 60 * 60, // 3 days
    bounty: 2_000_000,               // 2 USDG
    bountyReserve: 50_000_000,       // 50 USDG
    bands,
    partners,
  });

  console.log("Vault deployed:");
  console.log("  vault:   ", result.vault);
  console.log("  mandate: ", result.mandate);
  console.log("  adapter: ", result.adapter);
  console.log("\nNext step: put the `vault` address into CONFIG.vaultAddress in src/main.js");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

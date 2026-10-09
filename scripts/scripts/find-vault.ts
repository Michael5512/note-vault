// Find your already-deployed vault without creating a new one.
// Run with: npx tsx scripts/find-vault.ts
// -------------------------------------------------------------
// Lists every vault the factory knows about and reads each one's
// symbol directly (standard ERC-20 read — every NoteVault is also
// an ERC-4626/ERC-20 token). Looks for "mykeUSDG", the symbol set
// in deploy-vault.ts at creation, and flags it.
// -------------------------------------------------------------

import { createPublicClient, http } from "viem";
import { robinhoodTestnet } from "@note-systems/sdk";

const RPC_URL = "https://rpc.testnet.chain.robinhood.com";
const FACTORY = "0x9bAb91150CB9538B63768E9E892c9C0a7Cd36Cd8";

const FACTORY_ABI = [
  { type: "function", name: "vaultCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
    { type: "function", name: "vaults", stateMutability: "view", inputs: [{ type: "uint256" }, { type: "uint256" }], outputs: [{ type: "address[]" }] },
    ];

    const ERC20_ABI = [
      { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
        { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
        ];

        const MANDATE_ABI = [
          { type: "function", name: "mandate", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
          ];

          async function main() {
            const publicClient = createPublicClient({ chain: robinhoodTestnet, transport: http(RPC_URL) });

              const count = await publicClient.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: "vaultCount" });
                console.log(`Factory reports ${count} vault(s) total.\n`);

                  const vaults = await publicClient.readContract({
                      address: FACTORY, abi: FACTORY_ABI, functionName: "vaults", args: [0n, count],
                        });

                          for (let i = 0; i < vaults.length; i++) {
                              const v = vaults[i];
                                  try {
                                        const [symbol, name] = await Promise.all([
                                                publicClient.readContract({ address: v, abi: ERC20_ABI, functionName: "symbol" }),
                                                        publicClient.readContract({ address: v, abi: ERC20_ABI, functionName: "name" }),
                                                              ]);
                                                                    const flag = symbol === "mykeUSDG" ? "  ⭐ THIS ONE" : "";
                                                                          console.log(`[${i}] ${v}  —  ${name} (${symbol})${flag}`);

                                                                                if (symbol === "mykeUSDG") {
                                                                                        const mandate = await publicClient.readContract({ address: v, abi: MANDATE_ABI, functionName: "mandate" });
                                                                                                console.log(`      mandate: ${mandate}`);
                                                                                                        console.log(`\n      → Put this into CONFIG.vaultAddress in src/main.js:\n      vaultAddress: "${v}",\n`);
                                                                                                              }
                                                                                                                  } catch (err) {
                                                                                                                        console.log(`[${i}] ${v}  —  (couldn't read symbol/name)`);
                                                                                                                            }
                                                                                                                              }
                                                                                                                              }

                                                                                                                              main().catch((err) => {
                                                                                                                                console.error(err);
                                                                                                                                  process.exit(1);
                                                                                                                                  });
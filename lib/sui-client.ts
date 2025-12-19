import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { coinWithBalance, Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { GamePlayInfoBcs, MinerBcs } from "@/lib/bcs";

// Package and object IDs
export const PACKAGE_ID =
  "0xc5b9f227de9bcab624684d2664a84759ee77cfa1311e9ef3b13144b53ffa8f9d";
export const VERSION_OBJECT =
  "0x1f2a8b1f030e7d1476acb9b36423a0d65ad81bca96fab52a1cb21dc582e737cd";
export const GAMEPLAY_OBJECT =
  "0x6d1f1f052b2be6584c5ea02399e091d51b2e40b326b9f899765873f9f6cac9e3";

// Initialize Sui client
export function getSuiClient(
  network: "mainnet" | "testnet" | "devnet" = "mainnet"
) {
  return new SuiClient({ url: getFullnodeUrl(network) });
}

// Create keypair from private key
export function getKeypairFromPrivateKey(privateKey: string): Ed25519Keypair {
  return Ed25519Keypair.fromSecretKey(privateKey);
}

// Get wallet balances
export async function getWalletBalances(
  address: string,
  network: "mainnet" | "testnet" | "devnet" = "mainnet"
) {
  const client = getSuiClient(network);

  try {
    // Get all coin balances
    const balances = await client.getAllBalances({ owner: address });

    return {
      sui:
        balances.find((b) => b.coinType === "0x2::sui::SUI")?.totalBalance ||
        "0",
      aur:
        balances.find((b) => b.coinType.includes("AUR"))?.totalBalance || "0",
      // Add more token types as needed
    };
  } catch (error) {
    console.error("[v0] Error fetching balances:", error);
    throw error;
  }
}

// Get objects owned by address
export async function getOwnedObjects(
  address: string,
  network: "mainnet" | "testnet" | "devnet" = "mainnet"
) {
  const client = getSuiClient(network);

  try {
    const objects = await client.getOwnedObjects({
      owner: address,
      options: {
        showType: true,
        showContent: true,
      },
    });

    return objects.data;
  } catch (error) {
    console.error("[v0] Error fetching objects:", error);
    throw error;
  }
}

// Mine function
export async function mine(params: {
  privateKey: string;
  amountPerBlock: bigint;
  amountDecimal: bigint;
  claimSui: boolean;
  blockSelected: number[];
  network?: "mainnet" | "testnet" | "devnet";
}) {
  const client = getSuiClient(params.network || "mainnet");
  const keypair = getKeypairFromPrivateKey(params.privateKey);
  try {
    const tx = new Transaction();
    const coin = coinWithBalance({
      balance: params.amountDecimal,
      useGasCoin: true,
    });

    if (params.claimSui) {
      tx.moveCall({
        target: `${PACKAGE_ID}::gameplay::claim_rewards_sui`,
        arguments: [tx.object(VERSION_OBJECT), tx.object(GAMEPLAY_OBJECT)],
      });
    }

    tx.moveCall({
      target: `${PACKAGE_ID}::gameplay::manual_deploy`,
      arguments: [
        tx.object(VERSION_OBJECT),
        tx.object(GAMEPLAY_OBJECT),
        tx.pure("vector<u64>", params.blockSelected),
        tx.pure.u64(params.amountPerBlock),
        coin,
        tx.object.clock(),
      ],
    });

    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: {
        showEffects: true,
      },
    });

    return {
      success: true,
      digest: result.digest,
    };
  } catch (error) {
    console.error("[v0] Error mining:", error);
    throw error;
  }
}

// Get Miner Info
export async function getMinerInfo(
  address: string,
  network: "mainnet" | "testnet" | "devnet" = "mainnet"
) {
  const client = getSuiClient(network);
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::gameplay::get_miner_info`,
    arguments: [tx.object(GAMEPLAY_OBJECT)],
  });
  const txResponse = await client.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: address,
  });
  const result = txResponse.results;
  if (txResponse.error || !result) {
    return {
      refined: "0",
      sui: "0",
      aur: "0",
    };
  }
  const data = MinerBcs.parse(
    new Uint8Array(result![result ? result.length - 1 : 0].returnValues![0][0])
  );

  return {
    sui: data.rewards_sui,
    aur: data.rewards_aur,
    refined: data.refined_aur,
  };
}

//Get Gameplay
export async function getMineInfo(
  network: "mainnet" | "testnet" | "devnet" = "mainnet"
) {
  const client = getSuiClient(network);

  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::gameplay::get_gameplay_info`,
    arguments: [tx.object(GAMEPLAY_OBJECT)],
  });

  const txResponse = await client.devInspectTransactionBlock({
    transactionBlock: tx,
    sender:
      "0x0000000000000000000000000000000000000000000000000000000000000000",
  });

  const result = txResponse.results;

  return GamePlayInfoBcs.parse(
    new Uint8Array(result![result ? result.length - 1 : 0].returnValues![0][0])
  );
}

import { bcs } from "@mysten/sui/bcs";

export const MinerBcs = bcs.struct("Miner", {
  checkpoint_id: bcs.u64(),
  round_id: bcs.u64(),
  rewards_factor: bcs.u256(),
  rewards_aur: bcs.u64(),
  rewards_sui: bcs.u64(),
  refined_aur: bcs.u64(),
  last_claim_sui_at: bcs.u64(),
  last_claim_aur_at: bcs.u64(),
});
export const GameplayBlockBcs = bcs.struct("GetGameplayInfoBlockResult", {
  id: bcs.u64(),
  total_miner: bcs.u64(),
  total_deployed: bcs.u64(),
  my_deployed: bcs.u64(),
  my_cumulative_start: bcs.u64(),
  my_cumulative_end: bcs.u64(),
});

export const GamePlayInfoBcs = bcs.struct("GetGameplayInfoResult", {
  total_blocks: bcs.u64(),
  current_round_id: bcs.u64(),
  start_round_at_ms: bcs.u64(),
  ended_round_at_ms: bcs.u64(),
  motherlode: bcs.u64(),
  lucky_block_id: bcs.option(bcs.u64()),
  lucky_cumulative: bcs.option(bcs.u64()),
  blocks: bcs.vector(GameplayBlockBcs),
});

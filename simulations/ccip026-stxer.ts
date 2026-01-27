/**
 * Stxer Simulation for CCIP-026 MiamiCoin Burn to Exit
 *
 * This simulation tests the full flow of:
 * 1. Deploying the contracts
 * 2. Voting on the proposal
 * 3. Executing the proposal through the DAO
 * 4. Redeeming MIA tokens for STX
 *
 * Run with: npm run test:stxer
 */

import {
  AnchorMode,
  PostConditionMode,
  boolCV,
  principalCV,
  uintCV,
} from "@stacks/transactions";
import { SimulationBuilder } from "stxer";
import fs from "fs";

// Contract configuration
const CONTRACT_NAME_PROPOSAL = "ccip026-miamicoin-burn-to-exit";
const CONTRACT_NAME_REDEEM = "ccd013-burn-to-exit-mia";
const DEPLOYER = "SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9";
const PROPOSAL_CONTRACT_ID = `${DEPLOYER}.${CONTRACT_NAME_PROPOSAL}`;

// Common transaction parameters
const COMMON_TX_PARAMS = {
  publicKey: "",
  postConditionMode: PostConditionMode.Allow,
  anchorMode: AnchorMode.Any,
  fee: 100,
};

/**
 * Creates a vote transaction for the CCIP-026 proposal
 */
function vote(sender: string, nonce: number) {
  return {
    contract_id: PROPOSAL_CONTRACT_ID,
    function_name: "vote-on-proposal",
    function_args: [boolCV(true)],
    nonce: nonce++,
    sender,
    ...COMMON_TX_PARAMS,
  };
}

/**
 * Creates a direct execute transaction through the DAO
 */
function directExecute(sender: string, nonce: number) {
  return {
    contract_id:
      "SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.ccd001-direct-execute",
    function_name: "direct-execute",
    function_args: [principalCV(PROPOSAL_CONTRACT_ID)],
    nonce: nonce++,
    sender,
    ...COMMON_TX_PARAMS,
  };
}

/**
 * Creates a redeem transaction to exchange MIA for STX
 */
function redeem(sender: string, nonce: number, amount: number) {
  return {
    contract_id: `${DEPLOYER}.${CONTRACT_NAME_REDEEM}`,
    function_name: "redeem-mia",
    function_args: [uintCV(amount)],
    nonce: nonce++,
    sender,
    ...COMMON_TX_PARAMS,
  };
}

/**
 * Creates a convert-to-v2 transaction for MIA token migration
 */
function convertToV2(sender: string, nonce: number) {
  return {
    contract_id: `SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R.miamicoin-token-v2`,
    function_name: "convert-to-v2",
    function_args: [],
    nonce: nonce++,
    sender,
    ...COMMON_TX_PARAMS,
  };
}

/**
 * Main simulation function that builds and runs the full CCIP-026 flow
 * @param block_height - Stacks block height to fork from
 */
function main(block_height: number) {
  return (
    SimulationBuilder.new()
      .useBlockHeight(block_height)
      // Deploy redemption contract first (dependency)
      .addContractDeploy({
        contract_name: CONTRACT_NAME_REDEEM,
        source_code: fs.readFileSync(
          `./contracts/${CONTRACT_NAME_REDEEM}.clar`,
          "utf8"
        ),
        deployer: DEPLOYER,
      })
      // Deploy proposal contract
      .addContractDeploy({
        contract_name: CONTRACT_NAME_PROPOSAL,
        source_code: fs.readFileSync(
          `./contracts/${CONTRACT_NAME_PROPOSAL}.clar`,
          "utf8"
        ),
        deployer: DEPLOYER,
      })
      // Voting phase
      .addContractCall(vote("SP39EH784WK8VYG0SXEVA0M81DGECRE25JYSZ5XSA", 74))
      .addContractCall(vote("SP1T91N2Y2TE5M937FE3R6DE0HGWD85SGCV50T95A", 249))
      .addContractCall(vote("SP18Z92ZT0GAB2JHD21CZ3KS1WPGNDJCYZS7CV3MD", 529))
      // DAO execution phase (requires 3 signers)
      .addContractCall(
        directExecute("SP7DGES13508FHRWS1FB0J3SZA326FP6QRMB6JDE", 124)
      )
      .addContractCall(
        directExecute("SP3YYGCGX1B62CYAH4QX7PQE63YXG7RDTXD8BQHJQ", 19)
      )
      .addContractCall(
        directExecute("SPN4Y5QPGQA8882ZXW90ADC2DHYXMSTN8VAR8C3X", 851)
      )
      // Redemption phase
      .addContractCall(
        redeem("SP39EH784WK8VYG0SXEVA0M81DGECRE25JYSZ5XSA", 75, 321_825_000000)
      )
      .addContractCall(
        // Attempt to redeem with 0 balance - should fail
        redeem("SP39EH784WK8VYG0SXEVA0M81DGECRE25JYSZ5XSA", 76, 321_825_000000)
      )
      .addContractCall(
        // Attempt to redeem more than max per tx (10m MIA limit)
        redeem(
          "SP3BSWJTYBDJGDGZ54T4T0NMBGQ6BBFZCWD44VMH9",
          453,
          11_000_000_000000
        )
      )
      // Redeem V1 tokens
      .addContractCall(
        redeem("SP22HP2QFA16AAP62HJWD85AKMYJ5AYRTH7TBT9MX", 10, 800_000_000000)
      )

      .run()
      .catch(console.error)
  );
}

// Block height configurations for testing
const BLOCK_HEIGHT_EMPTY = 3425439;       // Empty treasury state
const BLOCK_HEIGHT_31K_STX = 3491155;     // ~31k STX in treasury

// Run simulation with treasury containing ~31k STX
// Uncomment the line below to test with empty treasury:
// main(BLOCK_HEIGHT_EMPTY).catch(console.error);
main(BLOCK_HEIGHT_31K_STX).catch(console.error);

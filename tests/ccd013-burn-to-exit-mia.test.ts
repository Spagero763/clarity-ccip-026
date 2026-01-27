import { boolCV, tupleCV, uintCV } from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import {
  convertToV2,
  directExecute,
  redeem,
  vote,
} from "./clients/ccd013-burn-to-exit-mia-client";

/**
 * CCD013 Burn to Exit MIA Tests
 * 
 * This test suite validates the MiamiCoin redemption mechanism
 * using Mainnet Execution Simulation (MXS) at block height 3,491,155.
 * 
 * Redemption Ratio: 1,700 STX per 1,000,000 MIA (0.0017 STX per MIA)
 * Treasury Balance: ~31,039 STX available for redemption
 * 
 * Test Flow:
 * 1. Vote on CCIP-026 proposal
 * 2. Execute via DAO signers (3 approvals needed)
 * 3. Test redemption scenarios for V1 and V2 tokens
 * 
 * Key Test Addresses:
 * - SP39EH784...: Large MIA stacker (V2 holder)
 * - SP22HP2QF...: V1 token holder
 * - SP18Z92ZT...: Non-stacker (for failure tests)
 */
describe("CCD013 Burn to Exit MIA", () => {
  it("should allow users to redeem MIA at 1700 STX per 1M MIA ratio", async () => {
    // Verify starting block height
    expect(simnet.blockHeight).toBe(3491156);

    let txReceipts: any;

    // Step 1: Vote on the proposal
    txReceipts = simnet.mineBlock([
      vote("SP39EH784WK8VYG0SXEVA0M81DGECRE25JYSZ5XSA"), // valid stacker
      vote("SP1T91N2Y2TE5M937FE3R6DE0HGWD85SGCV50T95A"), // valid stacker
      vote("SP18Z92ZT0GAB2JHD21CZ3KS1WPGNDJCYZS7CV3MD"), // not a stacker - should fail
    ]);

    expect(txReceipts[0].result).toBeOk(boolCV(true));
    expect(txReceipts[1].result).toBeOk(boolCV(true));
    expect(txReceipts[2].result).toBeErr(uintCV(26003)); // ERR_NOTHING_STACKED

    // Step 2: Execute the proposal via DAO signers
    txReceipts = simnet.mineBlock([
      directExecute("SP7DGES13508FHRWS1FB0J3SZA326FP6QRMB6JDE"),
      directExecute("SP3YYGCGX1B62CYAH4QX7PQE63YXG7RDTXD8BQHJQ"),
      directExecute("SPN4Y5QPGQA8882ZXW90ADC2DHYXMSTN8VAR8C3X"),
    ]);

    // Verify each signer's execution succeeds
    expect(txReceipts[0].result).toBeOk(uintCV(1)); // first approval
    expect(txReceipts[1].result).toBeOk(uintCV(2)); // second approval
    expect(txReceipts[2].result).toBeOk(uintCV(3)); // third approval - threshold met

    // Step 3: Test redemption scenarios
    txReceipts = simnet.mineBlock([
      // Redeem V2 tokens
      redeem("SP39EH784WK8VYG0SXEVA0M81DGECRE25JYSZ5XSA", 321_825_000000),
      // Try to redeem again with no balance - should fail
      redeem("SP39EH784WK8VYG0SXEVA0M81DGECRE25JYSZ5XSA", 321_825_000000),
      // Redeem V1 tokens (holder of v1)
      redeem("SP22HP2QFA16AAP62HJWD85AKMYJ5AYRTH7TBT9MX", 800_000_000000),
      // Try to convert to v2 after redeeming - should fail
      convertToV2("SP22HP2QFA16AAP62HJWD85AKMYJ5AYRTH7TBT9MX"),
      // Try to redeem again with no balance - should fail
      redeem("SP22HP2QFA16AAP62HJWD85AKMYJ5AYRTH7TBT9MX", 800_000_000000),
    ]);

    // Verify V2 redemption: 321.825M MIA -> ~547.1 STX
    expect(txReceipts[0].result).toBeOk(
      tupleCV({
        uStx: uintCV(547_102500),     // STX received
        uMia: uintCV(321_825_000000), // total MIA burned
        miaV1: uintCV(0),             // V1 amount burned
        uMiaV2: uintCV(321_825_000000), // V2 amount burned
      })
    );

    // Second redemption should fail - nothing to redeem
    expect(txReceipts[1].result).toBeErr(uintCV(13007)); // ERR_NOTHING_TO_REDEEM

    // V1 redemption: 800M MIA -> 1360 STX
    expect(txReceipts[2].result).toBeOk(
      tupleCV({
        uStx: uintCV(1360_000000),    // STX received
        uMia: uintCV(800_000_000000), // total MIA burned
        miaV1: uintCV(800_000),       // V1 amount burned (in whole MIA)
        uMiaV2: uintCV(0),            // V2 amount burned
      })
    );

    // Convert to V2 should fail - no V1 balance left
    expect(txReceipts[3].result).toBeErr(uintCV(2003));

    // Third redemption should fail - nothing to redeem
    expect(txReceipts[4].result).toBeErr(uintCV(13007)); // ERR_NOTHING_TO_REDEEM
  }, 120000);
});

import {
  boolCV,
  ClarityType,
  ResponseCV,
  responseErrorCV,
  responseOkCV,
  SomeCV,
  TupleCV,
  UIntCV,
  uintCV,
} from "@stacks/transactions";
import { describe, expect, it } from "vitest";
import { vote } from "./clients/ccip026-miamicoin-burn-to-exit-client";

/**
 * CCIP026 Vote Tests
 * 
 * This test suite validates the voting mechanism for CCIP-026: MiamiCoin Burn to Exit.
 * Uses Mainnet Execution Simulation (MXS) at block height 3,491,155 to test with
 * real stacker data and voting weights.
 * 
 * Key Test Addresses (Real Mainnet Stackers):
 * - SP39EH784WK8VYG0SXEVA0M81DGECRE25JYSZ5XSA: Large stacker (144.479B MIA voting power)
 * - SP1T91N2Y2TE5M937FE3R6DE0HGWD85SGCV50T95A: Smaller stacker (2.086B MIA voting power)
 * 
 * Vote Outcome Rules:
 * - Proposal passes if totalAmountYes > totalAmountNo
 * - ERR_VOTE_FAILED (26007) if no votes exceed yes votes
 */

/**
 * Helper function to verify vote totals in the CityVotes map
 * @param totalAmountYes - Expected total MIA amount voting yes
 * @param totalVotesYes - Expected number of yes votes
 * @param totalAmountNo - Expected total MIA amount voting no
 * @param totalVotesNo - Expected number of no votes
 */
const checkVotes = async (
  totalAmountYes: bigint,
  totalVotesYes: bigint,
  totalAmountNo: bigint,
  totalVotesNo: bigint
) => {
  const result = simnet.getMapEntry(
    "ccip026-miamicoin-burn-to-exit",
    "CityVotes",
    uintCV(1) // MIA city ID
  ) as SomeCV<
    TupleCV<{
      totalAmountYes: UIntCV;
      totalAmountNo: UIntCV;
      totalVotesYes: UIntCV;
      totalVotesNo: UIntCV;
    }>
  >;
  expect(result.value.value.totalAmountYes.value).toBe(totalAmountYes);
  expect(result.value.value.totalVotesYes.value).toBe(totalVotesYes);
  expect(result.value.value.totalAmountNo.value).toBe(totalAmountNo);
  expect(result.value.value.totalVotesNo.value).toBe(totalVotesNo);
};

/**
 * Helper function to verify proposal executability status
 * @param expected - Expected response (ok or err)
 */
const checkIsExecutable = (expected: ResponseCV) => {
  const receipt = simnet.callReadOnlyFn(
    "ccip026-miamicoin-burn-to-exit",
    "is-executable",
    [],
    simnet.deployer
  ) as ClarityType;
  expect(receipt.result).toStrictEqual(expected);
};

describe("CCIP026 Vote", () => {
  /**
   * Test: Voter Eligibility Validation
   * 
   * Verifies that only registered stackers can vote on the proposal.
   * Non-stackers and unregistered users should be rejected with appropriate errors.
   */
  it("should reject votes from non-stackers and unregistered users", async () => {
    let txReceipts: any;
    txReceipts = simnet.mineBlock([
      vote("SP18Z92ZT0GAB2JHD21CZ3KS1WPGNDJCYZS7CV3MD", true), // not a stacker
      vote("SP22HP2QFA16AAP62HJWD85AKMYJ5AYRTH7TBT9MX", true), // v1 holder but not registered
    ]);
    expect(txReceipts[0].result).toBeErr(uintCV(26003)); // ERR_NOTHING_STACKED
    expect(txReceipts[1].result).toBeErr(uintCV(26004)); // ERR_USER_NOT_FOUND
    checkIsExecutable(responseErrorCV(uintCV(26007))); // ERR_VOTE_FAILED
  });

  it("should reject duplicate votes with the same choice", async () => {
    let txReceipts: any;

    // First vote - should succeed
    txReceipts = simnet.mineBlock([
      vote("SP39EH784WK8VYG0SXEVA0M81DGECRE25JYSZ5XSA", true),
    ]);
    expect(txReceipts[0].result).toBeOk(boolCV(true));

    // Try to vote with same choice again - should fail
    txReceipts = simnet.mineBlock([
      vote("SP39EH784WK8VYG0SXEVA0M81DGECRE25JYSZ5XSA", true),
    ]);
    expect(txReceipts[0].result).toBeErr(uintCV(26002)); // ERR_VOTED_ALREADY
  });

  it("should allow users to change their vote from yes to no", async () => {
    let txReceipts: any;

    // First vote yes
    txReceipts = simnet.mineBlock([
      vote("SP1T91N2Y2TE5M937FE3R6DE0HGWD85SGCV50T95A", true),
    ]);
    expect(txReceipts[0].result).toBeOk(boolCV(true));
    checkVotes(2086372000000n, 1n, 0n, 0n);

    // Change vote to no
    txReceipts = simnet.mineBlock([
      vote("SP1T91N2Y2TE5M937FE3R6DE0HGWD85SGCV50T95A", false),
    ]);
    expect(txReceipts[0].result).toBeOk(boolCV(true));
    checkVotes(0n, 0n, 2086372000000n, 1n);
  });

  it("should calculate MIA vote amounts correctly", async () => {
    // Test for a known stacker
    const miaVoteScaled = simnet.callReadOnlyFn(
      "ccip026-miamicoin-burn-to-exit",
      "get-mia-vote",
      [uintCV(1), boolCV(true)], // userId 1, scaled
      "SP1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRCBGD7R"
    );

    const miaVoteUnscaled = simnet.callReadOnlyFn(
      "ccip026-miamicoin-burn-to-exit",
      "get-mia-vote",
      [uintCV(1), boolCV(false)], // userId 1, unscaled
      "SP1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRCBGD7R"
    );

    expect(miaVoteScaled.result).toBeSome(
      uintCV(4443750000000000000000000000n)
    );
    expect(miaVoteUnscaled.result).toBeSome(uintCV(444375000000));
  });

  it("should count user votes - yes-no", async () => {
    let txReceipts: any;
    txReceipts = simnet.mineBlock([
      vote("SP39EH784WK8VYG0SXEVA0M81DGECRE25JYSZ5XSA", true),
      vote("SP1T91N2Y2TE5M937FE3R6DE0HGWD85SGCV50T95A", false),
    ]);
    expect(txReceipts[0].result).toBeOk(boolCV(true));
    expect(txReceipts[1].result).toBeOk(boolCV(true));

    // check votes
    checkVotes(144479012000000n, 1n, 2086372000000n, 1n);
    checkIsExecutable(responseErrorCV(uintCV(26007))); // vote failed
  });

  it("should aggregate votes correctly - no then yes scenario", async () => {
    let txReceipts: any;
    txReceipts = simnet.mineBlock([
      vote("SP39EH784WK8VYG0SXEVA0M81DGECRE25JYSZ5XSA", false), // large stacker votes no
      vote("SP1T91N2Y2TE5M937FE3R6DE0HGWD85SGCV50T95A", true),  // smaller stacker votes yes
    ]);
    expect(txReceipts[0].result).toBeOk(boolCV(true));
    expect(txReceipts[1].result).toBeOk(boolCV(true));

    // Verify vote totals: yes has smaller amount, no has larger amount
    checkVotes(2086372000000n, 1n, 144479012000000n, 1n);
    checkIsExecutable(responseErrorCV(uintCV(26007))); // ERR_VOTE_FAILED (no > yes)
  });

  it("should pass proposal when both stackers vote yes", async () => {
    let txReceipts: any;
    txReceipts = simnet.mineBlock([
      vote("SP39EH784WK8VYG0SXEVA0M81DGECRE25JYSZ5XSA", true),
      vote("SP1T91N2Y2TE5M937FE3R6DE0HGWD85SGCV50T95A", true),
    ]);
    expect(txReceipts[0].result).toBeOk(boolCV(true));
    expect(txReceipts[1].result).toBeOk(boolCV(true));

    // Verify combined vote totals
    checkVotes(146565384000000n, 2n, 0n, 0n);
    checkIsExecutable(responseOkCV(boolCV(true))); // Proposal passes!
  });

  it("should fail proposal when both stackers vote no", async () => {
    let txReceipts: any;
    txReceipts = simnet.mineBlock([
      vote("SP39EH784WK8VYG0SXEVA0M81DGECRE25JYSZ5XSA", false),
      vote("SP1T91N2Y2TE5M937FE3R6DE0HGWD85SGCV50T95A", false),
    ]);
    expect(txReceipts[0].result).toBeOk(boolCV(true));
    expect(txReceipts[1].result).toBeOk(boolCV(true));

    // Verify all votes are no
    checkVotes(0n, 0n, 146565384000000n, 2n);
    checkIsExecutable(responseErrorCV(uintCV(26007))); // ERR_VOTE_FAILED
  });
});

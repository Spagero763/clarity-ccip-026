/**
 * CCIP026 MiamiCoin Burn to Exit Client
 * 
 * Test client for interacting with the CCIP-026 voting proposal contract.
 * Provides helper functions for casting votes on the burn-to-exit proposal.
 * 
 * @module ccip026-miamicoin-burn-to-exit-client
 */

import { tx } from "@stacks/clarinet-sdk";
import { boolCV } from "@stacks/transactions";

/**
 * Cast a vote on the CCIP-026 proposal
 * 
 * Calls the vote-on-proposal function with the specified vote choice.
 * Only registered stackers with MIA stacked can vote successfully.
 * 
 * @param sender - The principal address casting the vote
 * @param voteValue - true for yes, false for no
 * @returns Transaction to cast a vote on the proposal
 * 
 * @example
 * // Cast a yes vote
 * vote("SP39EH784WK8VYG0SXEVA0M81DGECRE25JYSZ5XSA", true);
 * 
 * @example
 * // Cast a no vote
 * vote("SP1T91N2Y2TE5M937FE3R6DE0HGWD85SGCV50T95A", false);
 */
export const vote = (sender: string, voteValue: boolean) => {
  return tx.callPublicFn(
    "ccip026-miamicoin-burn-to-exit",
    "vote-on-proposal",
    [boolCV(voteValue)],
    sender
  );
};

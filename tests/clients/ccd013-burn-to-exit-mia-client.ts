/**
 * CCD013 Burn to Exit MIA Client
 * 
 * Test client for interacting with the CCD013 redemption extension.
 * Provides helper functions for voting, executing, and redeeming MIA tokens.
 * 
 * @module ccd013-burn-to-exit-mia-client
 */

import { tx } from "@stacks/clarinet-sdk";
import { contractPrincipalCV, uintCV } from "@stacks/transactions";
import { vote as vote026 } from "./ccip026-miamicoin-burn-to-exit-client";

/**
 * Cast a yes vote on the CCIP-026 proposal
 * 
 * Wraps the ccip026 vote function with vote=true for convenience.
 * 
 * @param sender - The principal address casting the vote
 * @returns Transaction to cast a yes vote
 */
export const vote = (sender: string) => {
  return vote026(sender, true);
};

/**
 * Execute the proposal via DAO direct-execute
 * 
 * Calls the ccd001-direct-execute contract to approve execution.
 * Requires 3 DAO signers to reach execution threshold.
 * 
 * @param sender - The DAO signer principal address
 * @returns Transaction to approve proposal execution
 */
export const directExecute = (sender: string) => {
  return tx.callPublicFn(
    "SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.ccd001-direct-execute",
    "direct-execute",
    [
      contractPrincipalCV(
        "SP1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRCBGD7R",
        "ccip026-miamicoin-burn-to-exit"
      ),
    ],
    sender
  );
};

export const redeem = (sender: string, amount: number) => {
  return tx.callPublicFn(
    "ccd013-burn-to-exit-mia",
    "redeem-mia",
    [uintCV(amount)],
    sender
  );
};

export const convertToV2 = (sender: string) => {
  return tx.callPublicFn(
    "SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R.miamicoin-token-v2",
    "convert-to-v2",
    [],
    sender
  );
};

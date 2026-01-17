import { Tx, tx } from "@hirosystems/clarinet-sdk";
import { Cl } from "@stacks/transactions";
import { vote as vote026 } from "./ccip026-miamicoin-burn-to-exit-client";

import type {
  ClarityAbi,
  ClarityAbiArgsToPrimitiveTypes,
  ClarityAbiFunction,
  ClarityAbiOutputToPrimitiveType,
  ExtractAbiFunction,
  ExtractAbiFunctionNames,
} from "clarity-abitype";
import { ccd001DirectExecuteAbi } from "./ccd001-direct-execute";

// Use a const assertion so TypeScript preserves literal types from the JSON ABI

type DirectExecuteFn = ExtractAbiFunction<typeof ccd001DirectExecuteAbi , "direct-execute">;
export type DirectExecuteArgs = ClarityAbiArgsToPrimitiveTypes<
  DirectExecuteFn["args"]
>;
export const DIRECTEXECUTE_FN: ExtractAbiFunctionNames<typeof ccd001DirectExecuteAbi> =
  "direct-execute";

function callPublicFn<
  abi extends ClarityAbi,
  functionName extends ExtractAbiFunctionNames<abi, "public">,
  abiFunction extends ClarityAbiFunction = ExtractAbiFunction<
    abi,
    functionName
  >,
>(config: {
  abi: abi;
  functionName: functionName | ExtractAbiFunctionNames<abi, "public">;
  functionArgs: ClarityAbiArgsToPrimitiveTypes<abiFunction["args"]>;
}, senderAddress: string): Tx {
  return tx.callPublicFn(
    "SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.ccd001-direct-execute",
    config.functionName,
    config.functionArgs,
    senderAddress,
  );
}


export const directExecute = (
  sender: string,
  proposalContract: string = "SP1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRCBGD7R",
  proposalName: string = "ccip026-miamicoin-burn-to-exit",
) => {
  // The ABI provides static typing (see `DirectExecuteArgs`), at runtime we still pass the CVs expected by the SDK.
  return callPublicFn({
    abi: ccd001DirectExecuteAbi,
    functionName: DIRECTEXECUTE_FN,
    functionArgs: [
      Cl.contractPrincipal(proposalContract, proposalName),
      Cl.uint(0),
    ],
  }, sender);
};


export const vote = (sender: string) => {
  return vote026(sender, true);
};

export const redeem = (sender: string, amount: number) => {
  return tx.callPublicFn(
    "ccd013-burn-to-exit-mia",
    "redeem-mia",
    [Cl.uint(amount)],
    sender,
  );
};

export const convertToV2 = (sender: string) => {
  return tx.callPublicFn(
    "SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R.miamicoin-token-v2",
    "convert-to-v2",
    [],
    sender,
  );
};

# CCIP 026 - Miamicoin Burn To Exit

## Contract implementation

This folder contains Clarity code according to CCIP-026:

- `ccip026-miamicoin-burn-to-exit.clar` - handles voting and activation of new redemption extension ccd013.
- `ccd013-burn-to-exit-mia.clar` - handles redemption once activated.

The project uses clarinet with mainnet execution simulation (MXS) starting at stacks block height 3491155.

When running tests with MXS and hitting rate limits, provide a `HIRO_API_KEY` from `https://platform.hiro.so` or use your own node.

## Prerequisites

- Node.js >= 18
- npm or pnpm
- Clarinet >= 2.x

## Installation

```bash
npm install
```

## Running Tests

### Unit Tests using Clarinet JS SDK

Folder `tests` contains unit tests using clarinet-sdk

```bash
npm test cc
```

### Unit tests with Clarunit

Folder `tests` contains also unit test contracts

```bash
npm test clarunit
```

### Fuzzy testing

Folder `contracts` also contains rendez vous contracts

```bash
npm run test:rv
npm run test:rv2
```

### Stxer simulation

Folder `simulations` contains a stxer.xyz simulation on stacks block height 3491155.

```bash
npm run test:stxer
```

## Contract Details

### CCIP026 - MiamiCoin Burn to Exit (Proposal Contract)

This contract implements the proposal mechanism for CCIP-026. It handles:

- **Voting**: Users who have stacked MIA tokens during cycles 82 and 83 can vote on the proposal
- **Vote Period**: Approximately 2 weeks (2016 Bitcoin blocks)
- **Execution**: Once the vote passes (yes > no), the proposal can be executed to enable the redemption extension

### CCD013 - Burn to Exit MIA (Redemption Contract)

This contract handles the actual redemption of MIA tokens for STX. Key features:

- **Redemption Ratio**: 1,700 STX per 1,000,000 MIA (0.0017 STX per MIA)
- **Max Per Transaction**: 10,000,000 MIA per transaction
- **Supports Both V1 and V2 MIA Tokens**: Users can redeem both token versions

## Error Codes

### CCIP026 Errors

| Code | Name | Description |
|------|------|-------------|
| 26000 | ERR_PANIC | Unexpected error |
| 26001 | ERR_SAVING_VOTE | Failed to save vote |
| 26002 | ERR_VOTED_ALREADY | User has already voted with same choice |
| 26003 | ERR_NOTHING_STACKED | User has no stacked MIA tokens |
| 26004 | ERR_USER_NOT_FOUND | User not registered |
| 26005 | ERR_PROPOSAL_NOT_ACTIVE | Proposal is not active |
| 26006 | ERR_PROPOSAL_STILL_ACTIVE | Proposal is still active |
| 26007 | ERR_VOTE_FAILED | Vote did not pass |

### CCD013 Errors

| Code | Name | Description |
|------|------|-------------|
| 13000 | ERR_UNAUTHORIZED | Caller is not authorized |
| 13005 | ERR_NOT_ENABLED | Redemptions are not enabled |
| 13006 | ERR_BALANCE_NOT_FOUND | User balance not found |
| 13007 | ERR_NOTHING_TO_REDEEM | No tokens to redeem |
| 13010 | ERR_NOT_ENOUGH_FUNDS_IN_CONTRACT | Insufficient funds in treasury |

## License

MIT

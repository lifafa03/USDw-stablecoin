# Setting Up fabric-samples

The `fabric-samples` directory is **NOT tracked in this repository** because it's the official Hyperledger Fabric samples repository.

## Why It's Not in Git

`fabric-samples` is excluded because:
- It's maintained by Hyperledger Foundation (separate repo)
- Contains 500+ MB of official code
- Has its own Git history
- Would create conflicts with upstream updates

## How to Set It Up

```bash
# Clone this repository
git clone https://github.com/lifafa03/USDw-stablecoin.git
cd USDw-stablecoin

# Install Fabric 2.5.4 (includes fabric-samples)
curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
chmod +x install-fabric.sh
./install-fabric.sh --fabric-version 2.5.4 binary docker samples
```

## What's Used

From `fabric-samples/`:
- **test-network/**: Local Fabric network
- **bin/**: CLI tools (peer, orderer, etc.)
- **config/**: Default configurations

## See Also

- [Hyperledger Fabric Samples](https://github.com/hyperledger/fabric-samples)
- [GENUSD Deployment Guide](./scripts/README.md)

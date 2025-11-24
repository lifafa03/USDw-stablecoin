# Prerequisites & Setup Requirements

This document lists all prerequisites and setup steps needed to run the USDw Stablecoin project on Hyperledger Fabric.

## 🖥️ System Requirements

### Operating System
- **Linux** (Ubuntu 20.04 LTS or later recommended)
- **macOS** (10.14 or later)
- **Windows** (Windows 10/11 with WSL2)

### Hardware Requirements
- **CPU:** 2+ cores recommended (4+ for better performance)
- **RAM:** Minimum 8GB (16GB recommended)
- **Disk Space:** At least 20GB free space
- **Network:** Internet connection for downloading dependencies

## 📦 Required Software

### 1. Docker & Docker Compose

**Docker** is required to run Hyperledger Fabric network containers.

#### Installation on Ubuntu/Debian
```bash
# Update package index
sudo apt-get update

# Install prerequisites
sudo apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release

# Add Docker's official GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Set up the stable repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add your user to docker group (avoid using sudo)
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
docker compose version
```

#### Installation on macOS
```bash
# Using Homebrew
brew install --cask docker

# Or download Docker Desktop from:
# https://www.docker.com/products/docker-desktop

# Start Docker Desktop app
# Verify installation
docker --version
docker compose version
```

#### Installation on Windows (WSL2)
1. Install WSL2: https://docs.microsoft.com/en-us/windows/wsl/install
2. Install Docker Desktop for Windows: https://www.docker.com/products/docker-desktop
3. Enable WSL2 integration in Docker Desktop settings
4. Open WSL2 terminal and verify:
```bash
docker --version
docker compose version
```

**Verify Docker is running:**
```bash
docker ps
# Should return empty list or running containers (not an error)
```

### 2. Node.js & npm

**Node.js** v14.x or higher is required for the REST API server and chaincode.

#### Installation on Ubuntu/Debian
```bash
# Using NodeSource repository (recommended)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should be v14.x or higher
npm --version   # Should be 6.x or higher
```

#### Installation on macOS
```bash
# Using Homebrew
brew install node@18

# Or download from: https://nodejs.org/

# Verify installation
node --version
npm --version
```

#### Installation on Windows (WSL2)
```bash
# Same as Ubuntu instructions above
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 3. Python 3.10+

**Python** is required for the simulation layer.

#### Installation on Ubuntu/Debian
```bash
# Python 3 is usually pre-installed
python3 --version

# If not installed or version < 3.10:
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv

# Verify installation
python3 --version  # Should be 3.10 or higher
pip3 --version
```

#### Installation on macOS
```bash
# Using Homebrew
brew install python@3.11

# Verify installation
python3 --version
pip3 --version
```

#### Installation on Windows (WSL2)
```bash
# Same as Ubuntu instructions
sudo apt-get install -y python3 python3-pip
```

### 4. Git

**Git** is required for version control and cloning the repository.

#### Installation on Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install -y git

# Configure git
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# Verify installation
git --version
```

#### Installation on macOS
```bash
# Usually pre-installed, or use Homebrew
brew install git

git --version
```

#### Installation on Windows (WSL2)
```bash
sudo apt-get install -y git
```

### 5. curl & wget

**curl** and **wget** are used for downloading Fabric binaries.

#### Installation
```bash
# Ubuntu/Debian
sudo apt-get install -y curl wget

# macOS (usually pre-installed)
brew install curl wget

# Verify
curl --version
wget --version
```

### 6. jq (JSON processor)

**jq** is useful for processing JSON responses from the blockchain.

#### Installation
```bash
# Ubuntu/Debian
sudo apt-get install -y jq

# macOS
brew install jq

# Verify
jq --version
```

## 📚 Hyperledger Fabric Prerequisites

### Fabric Binaries & Docker Images

The project includes Fabric binaries in the `fabric-samples` directory. If you need to download them separately:

```bash
# Navigate to fabric-samples directory
cd fabric-samples

# Download Fabric binaries and Docker images
curl -sSL https://bit.ly/2ysbOFE | bash -s -- 2.5.0 1.5.5

# This downloads:
# - Fabric binaries (peer, orderer, configtxgen, etc.)
# - Fabric Docker images
# - Fabric CA binaries and images
```

**Required Fabric components:**
- `peer` - Peer node binary
- `orderer` - Ordering service binary
- `configtxgen` - Channel configuration generator
- `configtxlator` - Configuration translator
- `cryptogen` - Cryptographic material generator
- `discover` - Service discovery binary

**Required Docker images:**
- `hyperledger/fabric-peer:2.5.0`
- `hyperledger/fabric-orderer:2.5.0`
- `hyperledger/fabric-ccenv:2.5.0`
- `hyperledger/fabric-baseos:2.5.0`
- `hyperledger/fabric-tools:2.5.0`

**Verify Fabric binaries:**
```bash
cd fabric-samples/test-network
../bin/peer version
../bin/orderer version
```

## 🐍 Python Dependencies

Install Python packages for the simulation layer:

```bash
cd simulation

# Install required packages
pip3 install -r requirements.txt

# Or install manually
pip3 install requests>=2.31.0
```

## 📦 Node.js Dependencies

Install Node.js packages for the REST API server and chaincode:

```bash
# For REST API server
cd app/server
npm install

# For chaincode (for local testing)
cd ../../chaincode/stablecoin-js
npm install

# For unit tests
cd ../../tests/chaincode
npm install
```

## ✅ Verification Checklist

Run these commands to verify all prerequisites are installed:

```bash
# System checks
echo "=== System Information ==="
uname -a
echo ""

# Docker
echo "=== Docker ==="
docker --version
docker compose version
docker ps
echo ""

# Node.js
echo "=== Node.js ==="
node --version
npm --version
echo ""

# Python
echo "=== Python ==="
python3 --version
pip3 --version
echo ""

# Git
echo "=== Git ==="
git --version
echo ""

# Additional tools
echo "=== Additional Tools ==="
curl --version | head -1
wget --version | head -1
jq --version
echo ""

# Fabric binaries (if in fabric-samples)
echo "=== Fabric Binaries ==="
if [ -f "fabric-samples/bin/peer" ]; then
    fabric-samples/bin/peer version | head -2
else
    echo "Fabric binaries not found. Run setup after cloning."
fi
```

**Expected output:**
- Docker: v20.10.x or higher
- Docker Compose: v2.x or higher
- Node.js: v14.x, v16.x, or v18.x
- npm: v6.x or higher
- Python: v3.10 or higher
- pip3: v20.x or higher
- Git: v2.x or higher
- Fabric peer: 2.5.0

## 🚀 Quick Setup Script

Save this as `check-prerequisites.sh` and run it:

```bash
#!/bin/bash

echo "==================================="
echo "USDw Stablecoin - Prerequisites Check"
echo "==================================="
echo ""

# Check Docker
if command -v docker &> /dev/null; then
    echo "✓ Docker installed: $(docker --version)"
else
    echo "✗ Docker NOT installed"
    MISSING=1
fi

# Check Docker Compose
if docker compose version &> /dev/null; then
    echo "✓ Docker Compose installed: $(docker compose version)"
else
    echo "✗ Docker Compose NOT installed"
    MISSING=1
fi

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✓ Node.js installed: $NODE_VERSION"
    # Check version
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ "$NODE_MAJOR" -lt 14 ]; then
        echo "  ⚠ Node.js version should be 14 or higher"
    fi
else
    echo "✗ Node.js NOT installed"
    MISSING=1
fi

# Check npm
if command -v npm &> /dev/null; then
    echo "✓ npm installed: $(npm --version)"
else
    echo "✗ npm NOT installed"
    MISSING=1
fi

# Check Python
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo "✓ Python installed: $PYTHON_VERSION"
else
    echo "✗ Python3 NOT installed"
    MISSING=1
fi

# Check pip
if command -v pip3 &> /dev/null; then
    echo "✓ pip3 installed: $(pip3 --version | cut -d' ' -f2)"
else
    echo "✗ pip3 NOT installed"
    MISSING=1
fi

# Check Git
if command -v git &> /dev/null; then
    echo "✓ Git installed: $(git --version)"
else
    echo "✗ Git NOT installed"
    MISSING=1
fi

# Check curl
if command -v curl &> /dev/null; then
    echo "✓ curl installed"
else
    echo "✗ curl NOT installed"
    MISSING=1
fi

# Check Docker is running
if docker ps &> /dev/null; then
    echo "✓ Docker daemon is running"
else
    echo "✗ Docker daemon is NOT running"
    echo "  Please start Docker Desktop or Docker service"
    MISSING=1
fi

echo ""
echo "==================================="
if [ -z "$MISSING" ]; then
    echo "✓ All prerequisites are installed!"
    echo "==================================="
    exit 0
else
    echo "✗ Some prerequisites are missing."
    echo "Please install missing components."
    echo "==================================="
    exit 1
fi
```

Make it executable and run:
```bash
chmod +x check-prerequisites.sh
./check-prerequisites.sh
```

## 🐛 Common Issues & Solutions

### Issue: Docker permission denied
**Error:** `Got permission denied while trying to connect to the Docker daemon socket`

**Solution:**
```bash
sudo usermod -aG docker $USER
newgrp docker
# Or restart your terminal/system
```

### Issue: Node.js version too old
**Error:** `npm requires Node.js version 14 or higher`

**Solution:**
```bash
# Remove old version and install latest LTS
sudo apt-get remove nodejs
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Issue: pip not found
**Error:** `pip3: command not found`

**Solution:**
```bash
# Ubuntu/Debian
sudo apt-get install -y python3-pip

# Or
python3 -m ensurepip --upgrade
```

### Issue: Docker images not pulling
**Error:** `Error response from daemon: manifest not found`

**Solution:**
```bash
# Manually pull Fabric images
docker pull hyperledger/fabric-peer:2.5.0
docker pull hyperledger/fabric-orderer:2.5.0
docker pull hyperledger/fabric-ccenv:2.5.0
docker pull hyperledger/fabric-baseos:2.5.0
```

### Issue: Port already in use
**Error:** `Bind for 0.0.0.0:7050 failed: port is already allocated`

**Solution:**
```bash
# Find process using the port
sudo lsof -i :7050
# Or
sudo netstat -tlnp | grep :7050

# Kill the process or stop other Fabric networks
cd fabric-samples/test-network
./network.sh down
```

## 📖 Additional Resources

- **Hyperledger Fabric Prerequisites:** https://hyperledger-fabric.readthedocs.io/en/latest/prereqs.html
- **Docker Documentation:** https://docs.docker.com/get-docker/
- **Node.js Documentation:** https://nodejs.org/en/docs/
- **Python Documentation:** https://docs.python.org/3/
- **WSL2 Setup Guide:** https://docs.microsoft.com/en-us/windows/wsl/install

## 🎯 Next Steps

Once all prerequisites are installed:

1. Clone the repository:
```bash
git clone https://github.com/lifafa03/USDw-stablecoin.git
cd USDw-stablecoin
```

2. Follow the setup instructions in `PROJECT_OVERVIEW.md`

3. Start the Fabric network and deploy the chaincode

4. Run the simulation to verify everything works

---

**Need Help?** 
- Check the `PROJECT_OVERVIEW.md` for detailed setup instructions
- Review the troubleshooting section above
- Consult Hyperledger Fabric documentation

**Last Updated:** November 24, 2025

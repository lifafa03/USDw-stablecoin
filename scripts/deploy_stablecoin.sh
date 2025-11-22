#!/bin/bash

################################################################################
# Stablecoin Chaincode Deployment Script
# 
# This script automates the complete lifecycle of deploying chaincode to 
# Hyperledger Fabric test-network. It demonstrates the new Fabric v2.x 
# chaincode lifecycle which provides better governance and control.
#
# Key Steps:
# 1. Network validation/startup
# 2. Chaincode packaging
# 3. Installation on peer nodes
# 4. Approval by organizations
# 5. Commitment to the channel
# 6. Initialization and verification
#
# Prerequisites:
# - Fabric binaries in PATH
# - Docker and Docker Compose running
# - Node.js and npm installed
################################################################################

set -e  # Exit immediately if any command fails
set -u  # Exit if undefined variables are used

# ==================== Configuration Variables ====================

# Chaincode configuration
CHAINCODE_NAME="stablecoincc"           # Name used to identify the chaincode
CHAINCODE_VERSION="1.0"                 # Version number (increment for upgrades)
CHAINCODE_SEQUENCE=1                    # Sequence number (increment for definition updates)
CHAINCODE_LANGUAGE="node"               # Programming language (node, golang, java)

# Network configuration
CHANNEL_NAME="mychannel"                # Channel where chaincode will be deployed
DELAY=3                                 # Delay between operations (seconds)

# Path configuration (relative to script location)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CHAINCODE_SOURCE_PATH="${PROJECT_ROOT}/chaincode/stablecoin-js"
TEST_NETWORK_PATH="${PROJECT_ROOT}/fabric-samples/test-network"

# Demo configuration for initial mint
DEMO_ACCOUNT="central_bank"
DEMO_MINT_AMOUNT="1000000"              # Initial supply to mint

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ==================== Utility Functions ====================

# Print colored messages
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_step() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}STEP $1: $2${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

# Check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# ==================== Validation Functions ====================

# Verify all prerequisites are met
verify_prerequisites() {
    print_step 0 "Verifying Prerequisites"
    
    # Check if Fabric binaries are in PATH
    if ! command_exists peer; then
        print_error "Fabric binaries not found in PATH"
        print_info "Please ensure fabric-samples/bin is in your PATH"
        exit 1
    fi
    print_success "Fabric binaries found"
    
    # Check if Docker is running
    if ! docker ps >/dev/null 2>&1; then
        print_error "Docker is not running or not accessible"
        exit 1
    fi
    print_success "Docker is running"
    
    # Check if test-network exists
    if [ ! -d "$TEST_NETWORK_PATH" ]; then
        print_error "Test network not found at: $TEST_NETWORK_PATH"
        exit 1
    fi
    print_success "Test network directory found"
    
    # Check if chaincode source exists
    if [ ! -d "$CHAINCODE_SOURCE_PATH" ]; then
        print_error "Chaincode source not found at: $CHAINCODE_SOURCE_PATH"
        exit 1
    fi
    print_success "Chaincode source found"
    
    # Check if chaincode has package.json
    if [ ! -f "$CHAINCODE_SOURCE_PATH/package.json" ]; then
        print_error "package.json not found in chaincode directory"
        exit 1
    fi
    print_success "Chaincode package.json found"
    
    print_success "All prerequisites verified"
}

# ==================== Network Management ====================

# Check if the network is running
is_network_running() {
    # Check if peer containers are running
    if docker ps | grep -q "peer0.org1.example.com"; then
        return 0  # Network is running
    else
        return 1  # Network is not running
    fi
}

# Start the Fabric test network
start_network() {
    print_step 1 "Starting Fabric Test Network"
    
    cd "$TEST_NETWORK_PATH"
    
    if is_network_running; then
        print_warning "Network is already running"
        print_info "To restart, run: ./network.sh down && ./network.sh up createChannel -c mychannel -ca"
    else
        print_info "Starting network with channel '$CHANNEL_NAME' and Certificate Authorities..."
        
        # Command: ./network.sh up createChannel -c mychannel -ca
        # - up: Starts the Fabric network (peers, orderer, CAs)
        # - createChannel: Creates a channel for peers to join
        # - -c mychannel: Specifies the channel name
        # - -ca: Starts Certificate Authorities for identity management
        ./network.sh up createChannel -c "$CHANNEL_NAME" -ca
        
        if [ $? -eq 0 ]; then
            print_success "Network started successfully"
        else
            print_error "Failed to start network"
            exit 1
        fi
    fi
    
    # Verify network is running
    if is_network_running; then
        print_success "Network verification passed"
    else
        print_error "Network is not running after startup attempt"
        exit 1
    fi
}

# ==================== Environment Setup ====================

# Set environment variables for peer CLI
setup_environment() {
    print_info "Setting up environment variables..."
    
    # Add Fabric binaries to PATH
    export PATH="${TEST_NETWORK_PATH}/../bin:$PATH"
    
    # Set the Fabric configuration path
    # This tells peer CLI where to find configuration files
    export FABRIC_CFG_PATH="${TEST_NETWORK_PATH}/../config/"
    
    print_success "Environment configured"
}

# Set environment variables for Org1 peer
set_org1_env() {
    print_info "Setting environment for Org1..."
    
    # Enable TLS (Transport Layer Security) for secure communication
    export CORE_PEER_TLS_ENABLED=true
    
    # Set the MSP (Membership Service Provider) ID for Org1
    export CORE_PEER_LOCALMSPID="Org1MSP"
    
    # Path to Org1's TLS CA certificate (for verifying peer identity)
    export CORE_PEER_TLS_ROOTCERT_FILE="${TEST_NETWORK_PATH}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
    
    # Path to Org1 admin's MSP (contains certificates and keys)
    export CORE_PEER_MSPCONFIGPATH="${TEST_NETWORK_PATH}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
    
    # Address of Org1's peer node
    export CORE_PEER_ADDRESS=localhost:7051
    
    print_success "Org1 environment set"
}

# Set environment variables for Org2 peer
set_org2_env() {
    print_info "Setting environment for Org2..."
    
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_LOCALMSPID="Org2MSP"
    export CORE_PEER_TLS_ROOTCERT_FILE="${TEST_NETWORK_PATH}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="${TEST_NETWORK_PATH}/organizations/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp"
    export CORE_PEER_ADDRESS=localhost:9051
    
    print_success "Org2 environment set"
}

# ==================== Chaincode Packaging ====================

# Package the chaincode
package_chaincode() {
    print_step 2 "Packaging Chaincode"
    
    cd "$TEST_NETWORK_PATH"
    
    # Check if chaincode dependencies are installed
    print_info "Checking chaincode dependencies..."
    if [ ! -d "$CHAINCODE_SOURCE_PATH/node_modules" ]; then
        print_warning "node_modules not found, installing dependencies..."
        cd "$CHAINCODE_SOURCE_PATH"
        npm install
        cd "$TEST_NETWORK_PATH"
    fi
    print_success "Dependencies verified"
    
    # Package name for the chaincode archive
    PACKAGE_NAME="${CHAINCODE_NAME}.tar.gz"
    
    # Remove old package if it exists
    if [ -f "$PACKAGE_NAME" ]; then
        print_warning "Removing old package..."
        rm "$PACKAGE_NAME"
    fi
    
    print_info "Creating chaincode package..."
    print_info "Command: peer lifecycle chaincode package"
    print_info "  --path: $CHAINCODE_SOURCE_PATH"
    print_info "  --lang: $CHAINCODE_LANGUAGE"
    print_info "  --label: ${CHAINCODE_NAME}_${CHAINCODE_VERSION}"
    
    # peer lifecycle chaincode package command:
    # Creates a deployable package (.tar.gz) containing the chaincode
    # 
    # Parameters:
    #   --path: Source code location
    #   --lang: Programming language (node, golang, java)
    #   --label: Human-readable identifier (used in approval/commit)
    #
    # Output: A .tar.gz file containing:
    #   - Chaincode source code
    #   - Metadata (type, label)
    #   - Connection information (for external chaincode)
    peer lifecycle chaincode package "$PACKAGE_NAME" \
        --path "$CHAINCODE_SOURCE_PATH" \
        --lang "$CHAINCODE_LANGUAGE" \
        --label "${CHAINCODE_NAME}_${CHAINCODE_VERSION}"
    
    if [ $? -eq 0 ]; then
        print_success "Chaincode packaged successfully: $PACKAGE_NAME"
    else
        print_error "Failed to package chaincode"
        exit 1
    fi
}

# ==================== Chaincode Installation ====================

# Install chaincode on Org1 peer
install_chaincode_org1() {
    print_step 3 "Installing Chaincode on Org1"
    
    cd "$TEST_NETWORK_PATH"
    set_org1_env
    
    print_info "Command: peer lifecycle chaincode install"
    print_info "  Package: ${CHAINCODE_NAME}.tar.gz"
    print_info "  Target: Org1 peer (localhost:7051)"
    
    # peer lifecycle chaincode install command:
    # Installs the chaincode package on a peer's filesystem
    # 
    # This step:
    # 1. Unpacks the chaincode package
    # 2. Stores it in the peer's chaincode directory
    # 3. Returns a Package ID (hash of the package)
    #
    # The Package ID is used in subsequent approval steps
    # Each peer that will endorse transactions needs the chaincode installed
    peer lifecycle chaincode install "${CHAINCODE_NAME}.tar.gz"
    
    if [ $? -eq 0 ]; then
        print_success "Chaincode installed on Org1"
    else
        print_error "Failed to install chaincode on Org1"
        exit 1
    fi
    
    sleep "$DELAY"
}

# Install chaincode on Org2 peer
install_chaincode_org2() {
    print_step 4 "Installing Chaincode on Org2"
    
    cd "$TEST_NETWORK_PATH"
    set_org2_env
    
    print_info "Command: peer lifecycle chaincode install"
    print_info "  Package: ${CHAINCODE_NAME}.tar.gz"
    print_info "  Target: Org2 peer (localhost:9051)"
    
    # Same installation process for Org2
    peer lifecycle chaincode install "${CHAINCODE_NAME}.tar.gz"
    
    if [ $? -eq 0 ]; then
        print_success "Chaincode installed on Org2"
    else
        print_error "Failed to install chaincode on Org2"
        exit 1
    fi
    
    sleep "$DELAY"
}

# ==================== Package ID Retrieval ====================

# Query and extract the Package ID
get_package_id() {
    print_step 5 "Retrieving Package ID"
    
    cd "$TEST_NETWORK_PATH"
    set_org1_env
    
    print_info "Command: peer lifecycle chaincode queryinstalled"
    
    # peer lifecycle chaincode queryinstalled command:
    # Lists all chaincode packages installed on the peer
    # 
    # Output format:
    # Package ID: <hash>:<label>, Label: <chaincode_label>
    #
    # We extract the Package ID to use in approval
    peer lifecycle chaincode queryinstalled > queryinstalled.txt
    
    # Extract Package ID using sed
    # Pattern matches: "Package ID: <anything>, Label: stablecoincc_1.0"
    PACKAGE_ID=$(sed -n "/${CHAINCODE_NAME}_${CHAINCODE_VERSION}/{s/^Package ID: //; s/, Label:.*$//; p;}" queryinstalled.txt)
    
    if [ -z "$PACKAGE_ID" ]; then
        print_error "Package ID not found"
        print_error "Available packages:"
        cat queryinstalled.txt
        exit 1
    fi
    
    print_success "Package ID: $PACKAGE_ID"
    
    # Export for use in other functions
    export PACKAGE_ID
}

# ==================== Chaincode Approval ====================

# Approve chaincode for Org1
approve_chaincode_org1() {
    print_step 6 "Approving Chaincode for Org1"
    
    cd "$TEST_NETWORK_PATH"
    set_org1_env
    
    print_info "Command: peer lifecycle chaincode approveformyorg"
    print_info "  Channel: $CHANNEL_NAME"
    print_info "  Chaincode: $CHAINCODE_NAME"
    print_info "  Version: $CHAINCODE_VERSION"
    print_info "  Sequence: $CHAINCODE_SEQUENCE"
    print_info "  Package ID: $PACKAGE_ID"
    
    # peer lifecycle chaincode approveformyorg command:
    # Approves a chaincode definition for your organization
    # 
    # This is part of Fabric's governance model where each org must
    # explicitly approve chaincode before it can be committed
    #
    # Parameters:
    #   -o: Orderer endpoint (coordinates the approval)
    #   --ordererTLSHostnameOverride: Overrides hostname for TLS
    #   --channelID: Target channel
    #   --name: Chaincode name
    #   --version: Chaincode version
    #   --package-id: Links approval to installed package
    #   --sequence: Definition sequence number (for updates)
    #   --tls: Enable TLS
    #   --cafile: Orderer's TLS CA certificate
    #
    # This command:
    # 1. Submits a proposal to the orderer
    # 2. Records org's approval in the channel's configuration
    # 3. Does NOT deploy the chaincode yet (need commit)
    peer lifecycle chaincode approveformyorg \
        -o localhost:7050 \
        --ordererTLSHostnameOverride orderer.example.com \
        --channelID "$CHANNEL_NAME" \
        --name "$CHAINCODE_NAME" \
        --version "$CHAINCODE_VERSION" \
        --package-id "$PACKAGE_ID" \
        --sequence "$CHAINCODE_SEQUENCE" \
        --tls \
        --cafile "${TEST_NETWORK_PATH}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"
    
    if [ $? -eq 0 ]; then
        print_success "Chaincode approved for Org1"
    else
        print_error "Failed to approve chaincode for Org1"
        exit 1
    fi
    
    sleep "$DELAY"
}

# Approve chaincode for Org2
approve_chaincode_org2() {
    print_step 7 "Approving Chaincode for Org2"
    
    cd "$TEST_NETWORK_PATH"
    set_org2_env
    
    print_info "Command: peer lifecycle chaincode approveformyorg"
    print_info "  Channel: $CHANNEL_NAME"
    print_info "  Chaincode: $CHAINCODE_NAME"
    print_info "  Version: $CHAINCODE_VERSION"
    print_info "  Sequence: $CHAINCODE_SEQUENCE"
    print_info "  Package ID: $PACKAGE_ID"
    
    # Same approval process for Org2
    peer lifecycle chaincode approveformyorg \
        -o localhost:7050 \
        --ordererTLSHostnameOverride orderer.example.com \
        --channelID "$CHANNEL_NAME" \
        --name "$CHAINCODE_NAME" \
        --version "$CHAINCODE_VERSION" \
        --package-id "$PACKAGE_ID" \
        --sequence "$CHAINCODE_SEQUENCE" \
        --tls \
        --cafile "${TEST_NETWORK_PATH}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"
    
    if [ $? -eq 0 ]; then
        print_success "Chaincode approved for Org2"
    else
        print_error "Failed to approve chaincode for Org2"
        exit 1
    fi
    
    sleep "$DELAY"
}

# ==================== Commit Readiness Check ====================

# Check if chaincode is ready to commit
check_commit_readiness() {
    print_step 8 "Checking Commit Readiness"
    
    cd "$TEST_NETWORK_PATH"
    set_org1_env
    
    print_info "Command: peer lifecycle chaincode checkcommitreadiness"
    
    # peer lifecycle chaincode checkcommitreadiness command:
    # Checks which organizations have approved the chaincode definition
    # 
    # This helps verify that enough orgs have approved before attempting commit
    # Output shows: { "Org1MSP": true, "Org2MSP": true }
    #
    # Commit requires approval from a majority of orgs (based on channel policy)
    peer lifecycle chaincode checkcommitreadiness \
        --channelID "$CHANNEL_NAME" \
        --name "$CHAINCODE_NAME" \
        --version "$CHAINCODE_VERSION" \
        --sequence "$CHAINCODE_SEQUENCE" \
        --tls \
        --cafile "${TEST_NETWORK_PATH}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
        --output json
    
    print_success "Commit readiness check complete"
}

# ==================== Chaincode Commit ====================

# Commit the chaincode definition to the channel
commit_chaincode() {
    print_step 9 "Committing Chaincode Definition"
    
    cd "$TEST_NETWORK_PATH"
    set_org1_env
    
    print_info "Command: peer lifecycle chaincode commit"
    print_info "  Channel: $CHANNEL_NAME"
    print_info "  Chaincode: $CHAINCODE_NAME"
    print_info "  Version: $CHAINCODE_VERSION"
    print_info "  Sequence: $CHAINCODE_SEQUENCE"
    print_info "  Endorsing peers: Org1, Org2"
    
    # peer lifecycle chaincode commit command:
    # Commits the chaincode definition to the channel
    # 
    # This is the final step that makes chaincode available for use
    # 
    # What happens:
    # 1. Chaincode definition is written to the channel configuration
    # 2. All peers start the chaincode containers
    # 3. Chaincode becomes invokable by applications
    #
    # Parameters:
    #   --peerAddresses: List of peers to collect endorsements from
    #   --tlsRootCertFiles: TLS certs for each peer (must match order)
    #
    # Note: Need endorsements from enough orgs to satisfy channel policy
    # (typically majority of orgs that approved)
    peer lifecycle chaincode commit \
        -o localhost:7050 \
        --ordererTLSHostnameOverride orderer.example.com \
        --channelID "$CHANNEL_NAME" \
        --name "$CHAINCODE_NAME" \
        --version "$CHAINCODE_VERSION" \
        --sequence "$CHAINCODE_SEQUENCE" \
        --tls \
        --cafile "${TEST_NETWORK_PATH}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
        --peerAddresses localhost:7051 \
        --tlsRootCertFiles "${TEST_NETWORK_PATH}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
        --peerAddresses localhost:9051 \
        --tlsRootCertFiles "${TEST_NETWORK_PATH}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt"
    
    if [ $? -eq 0 ]; then
        print_success "Chaincode committed successfully"
    else
        print_error "Failed to commit chaincode"
        exit 1
    fi
    
    # Wait for chaincode containers to start
    print_info "Waiting for chaincode containers to start..."
    sleep 5
}

# ==================== Verification ====================

# Query committed chaincode definitions
query_committed() {
    print_step 10 "Querying Committed Chaincode"
    
    cd "$TEST_NETWORK_PATH"
    set_org1_env
    
    print_info "Command: peer lifecycle chaincode querycommitted"
    
    # peer lifecycle chaincode querycommitted command:
    # Lists all chaincode definitions committed to the channel
    # 
    # Shows:
    # - Chaincode name, version, sequence
    # - Which organizations approved it
    # - Endorsement policy
    peer lifecycle chaincode querycommitted \
        --channelID "$CHANNEL_NAME" \
        --name "$CHAINCODE_NAME" \
        --cafile "${TEST_NETWORK_PATH}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"
    
    print_success "Query committed complete"
}

# ==================== Chaincode Initialization ====================

# Initialize the ledger
initialize_ledger() {
    print_step 11 "Initializing Ledger"
    
    cd "$TEST_NETWORK_PATH"
    set_org1_env
    
    print_info "Invoking InitLedger function..."
    print_info "Command: peer chaincode invoke"
    print_info "  Function: InitLedger"
    
    # peer chaincode invoke command:
    # Submits a transaction to the chaincode
    # 
    # Difference from 'query':
    # - invoke: Writes to the ledger, requires endorsement & ordering
    # - query: Read-only, no ledger modification, faster
    #
    # Parameters:
    #   -c: Function call in JSON format
    #       {"function": "FunctionName", "Args": ["arg1", "arg2"]}
    #
    # Process:
    # 1. Proposal sent to endorsing peers
    # 2. Peers execute chaincode and return endorsements
    # 3. Client submits endorsed transaction to orderer
    # 4. Orderer creates block and distributes to peers
    # 5. Peers validate and commit to ledger
    peer chaincode invoke \
        -o localhost:7050 \
        --ordererTLSHostnameOverride orderer.example.com \
        --tls \
        --cafile "${TEST_NETWORK_PATH}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
        -C "$CHANNEL_NAME" \
        -n "$CHAINCODE_NAME" \
        --peerAddresses localhost:7051 \
        --tlsRootCertFiles "${TEST_NETWORK_PATH}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
        --peerAddresses localhost:9051 \
        --tlsRootCertFiles "${TEST_NETWORK_PATH}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
        -c '{"function":"InitLedger","Args":[]}'
    
    if [ $? -eq 0 ]; then
        print_success "Ledger initialized"
    else
        print_warning "InitLedger may have already been called (this is normal)"
    fi
    
    sleep "$DELAY"
}

# ==================== Demo Transaction ====================

# Mint tokens to demo account
mint_demo_tokens() {
    print_step 12 "Minting Demo Tokens"
    
    cd "$TEST_NETWORK_PATH"
    set_org1_env
    
    print_info "Minting $DEMO_MINT_AMOUNT tokens to $DEMO_ACCOUNT..."
    print_info "Command: peer chaincode invoke"
    print_info "  Function: Mint"
    print_info "  Args: [\"$DEMO_ACCOUNT\", \"$DEMO_MINT_AMOUNT\"]"
    
    # Invoke Mint function
    # This demonstrates:
    # 1. Admin-only function (Org1MSP can mint)
    # 2. Creating initial token supply
    # 3. Successful chaincode execution
    peer chaincode invoke \
        -o localhost:7050 \
        --ordererTLSHostnameOverride orderer.example.com \
        --tls \
        --cafile "${TEST_NETWORK_PATH}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
        -C "$CHANNEL_NAME" \
        -n "$CHAINCODE_NAME" \
        --peerAddresses localhost:7051 \
        --tlsRootCertFiles "${TEST_NETWORK_PATH}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
        --peerAddresses localhost:9051 \
        --tlsRootCertFiles "${TEST_NETWORK_PATH}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
        -c "{\"function\":\"Mint\",\"Args\":[\"$DEMO_ACCOUNT\",\"$DEMO_MINT_AMOUNT\"]}"
    
    if [ $? -eq 0 ]; then
        print_success "Demo tokens minted successfully"
    else
        print_error "Failed to mint demo tokens"
        exit 1
    fi
    
    sleep "$DELAY"
}

# Verify the mint by querying balance
verify_deployment() {
    print_step 13 "Verifying Deployment"
    
    cd "$TEST_NETWORK_PATH"
    set_org1_env
    
    print_info "Querying balance of $DEMO_ACCOUNT..."
    print_info "Command: peer chaincode query"
    print_info "  Function: BalanceOf"
    print_info "  Args: [\"$DEMO_ACCOUNT\"]"
    
    # peer chaincode query command:
    # Executes a read-only query against the chaincode
    # 
    # Difference from invoke:
    # - Does NOT create a transaction
    # - Does NOT modify the ledger
    # - Faster (no endorsement/ordering required)
    # - Only queries one peer
    #
    # Used for: Reading state without writing
    RESULT=$(peer chaincode query \
        -C "$CHANNEL_NAME" \
        -n "$CHAINCODE_NAME" \
        -c "{\"function\":\"BalanceOf\",\"Args\":[\"$DEMO_ACCOUNT\"]}")
    
    if [ $? -eq 0 ]; then
        print_success "Query successful"
        echo -e "${GREEN}Result:${NC} $RESULT"
    else
        print_error "Query failed"
        exit 1
    fi
    
    # Query total supply
    print_info "Querying total supply..."
    TOTAL_SUPPLY=$(peer chaincode query \
        -C "$CHANNEL_NAME" \
        -n "$CHAINCODE_NAME" \
        -c '{"function":"TotalSupply","Args":[]}')
    
    if [ $? -eq 0 ]; then
        print_success "Total supply query successful"
        echo -e "${GREEN}Total Supply:${NC} $TOTAL_SUPPLY"
    else
        print_warning "Total supply query failed"
    fi
}

# ==================== Main Execution ====================

main() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                                                                ║"
    echo "║        STABLECOIN CHAINCODE DEPLOYMENT SCRIPT                  ║"
    echo "║        Hyperledger Fabric v2.x Lifecycle                       ║"
    echo "║                                                                ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}\n"
    
    print_info "Configuration:"
    echo "  Chaincode Name: $CHAINCODE_NAME"
    echo "  Version: $CHAINCODE_VERSION"
    echo "  Sequence: $CHAINCODE_SEQUENCE"
    echo "  Channel: $CHANNEL_NAME"
    echo "  Language: $CHAINCODE_LANGUAGE"
    echo "  Demo Account: $DEMO_ACCOUNT"
    echo "  Demo Amount: $DEMO_MINT_AMOUNT"
    echo ""
    
    # Execute all steps in order
    verify_prerequisites
    start_network
    setup_environment
    package_chaincode
    install_chaincode_org1
    install_chaincode_org2
    get_package_id
    approve_chaincode_org1
    approve_chaincode_org2
    check_commit_readiness
    commit_chaincode
    query_committed
    initialize_ledger
    mint_demo_tokens
    verify_deployment
    
    # Final summary
    echo -e "\n${GREEN}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                                                                ║"
    echo "║                  DEPLOYMENT SUCCESSFUL!                        ║"
    echo "║                                                                ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}\n"
    
    print_success "Chaincode '$CHAINCODE_NAME' version $CHAINCODE_VERSION is deployed and ready"
    print_success "Demo account '$DEMO_ACCOUNT' has been funded with $DEMO_MINT_AMOUNT tokens"
    
    echo -e "\n${BLUE}Next Steps:${NC}"
    echo "  1. Start the REST API server:"
    echo "     cd $PROJECT_ROOT/app/server"
    echo "     npm install && node server.js"
    echo ""
    echo "  2. Test with curl:"
    echo "     curl http://localhost:3000/balance/$DEMO_ACCOUNT"
    echo ""
    echo "  3. Run tests:"
    echo "     cd $PROJECT_ROOT/tests/chaincode"
    echo "     npm install && npm test"
    echo ""
    
    print_info "For chaincode logs, run:"
    echo "  docker logs -f dev-peer0.org1.example.com-${CHAINCODE_NAME}_${CHAINCODE_VERSION}"
    echo ""
}

# Run main function
main

# Exit successfully
exit 0

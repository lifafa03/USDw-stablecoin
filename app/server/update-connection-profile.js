const fs = require('fs');
const path = require('path');

const basePath = path.resolve(__dirname, '..', '..', 'fabric-samples', 'test-network', 'organizations');

// Read base connection profile
const ccpPath = path.join(basePath, 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

// Add Org2 peer TLS cert
const org2TlsCert = fs.readFileSync(
  path.join(basePath, 'peerOrganizations', 'org2.example.com', 'peers', 'peer0.org2.example.com', 'tls', 'ca.crt'),
  'utf8'
);

// Configure channels
ccp.channels = {
  mychannel: {
    orderers: ['orderer.example.com'],
    peers: {
      'peer0.org1.example.com': {
        endorsingPeer: true,
        chaincodeQuery: true,
        ledgerQuery: true,
        eventSource: true
      },
      'peer0.org2.example.com': {
        endorsingPeer: true,
        chaincodeQuery: true,
        ledgerQuery: true,
        eventSource: false
      }
    }
  }
};

// Add Org2 peer
ccp.peers['peer0.org2.example.com'] = {
  url: 'grpcs://localhost:9051',
  tlsCACerts: {
    pem: org2TlsCert
  },
  grpcOptions: {
    'ssl-target-name-override': 'peer0.org2.example.com',
    hostnameOverride: 'peer0.org2.example.com'
  }
};

// Add orderer
ccp.orderers = {
  'orderer.example.com': {
    url: 'grpcs://localhost:7050',
    tlsCACerts: {
      path: path.join(basePath, 'ordererOrganizations', 'example.com', 'orderers', 'orderer.example.com', 'msp', 'tlscacerts', 'tlsca.example.com-cert.pem')
    },
    grpcOptions: {
      'ssl-target-name-override': 'orderer.example.com'
    }
  }
};

// Save updated profile
const outputPath = path.join(__dirname, 'connection-org1-with-channel.json');
fs.writeFileSync(outputPath, JSON.stringify(ccp, null, 2));
console.log('✓ Updated connection profile saved to:', outputPath);

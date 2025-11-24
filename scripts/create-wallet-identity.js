const fs = require('fs');
const path = require('path');

const walletPath = process.argv[2];
const certPath = process.argv[3];
const keyPath = process.argv[4];

const certificate = fs.readFileSync(certPath, 'utf8');
const privateKey = fs.readFileSync(keyPath, 'utf8');

const identity = {
    credentials: {
        certificate: certificate,
        privateKey: privateKey
    },
    mspId: 'Org1MSP',
    type: 'X.509',
    version: 1
};

fs.writeFileSync(
    path.join(walletPath, 'appUser.id'),
    JSON.stringify(identity, null, 2)
);

console.log('✓ Identity file created successfully');

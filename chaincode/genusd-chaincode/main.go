package main

import (
	"fmt"
	"log"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/lifafa03/genusd-chaincode/genusd"
)

func main() {
	genUSDChaincode, err := contractapi.NewChaincode(&genusd.SmartContract{})
	if err != nil {
		log.Panicf("Error creating GENUSD chaincode: %v", err)
	}

	if err := genUSDChaincode.Start(); err != nil {
		fmt.Printf("Error starting GENUSD chaincode: %v", err)
	}
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract FactoryMultiSig {
  event ContractCreated(address sender, address contractAddress);
  address public owner;

  mapping(address => bool) public isCreated;
  mapping(address => address[]) public createdContracts;

  function createContract(address[] memory _owners, uint _required) public returns (address wallet) {
    wallet = address(new MultiSig(_owners, _required));
    createdContracts[msg.sender].push(wallet);
    isCreated[wallet] = true;
    emit ContractCreated(msg.sender, wallet);
  }

  function getCreatedContractsCount(address _creator) public view returns (uint) {
    return createdContracts[_creator].length;
  }

  function getCreatedContracts(address _creator) public view returns (address[] memory) {
    return createdContracts[_creator];
  }
}

contract MultiSig {
    // events
    event Deposit(address indexed sender, uint value, uint balance);
    event Submission(uint indexed txnId, address indexed sender, address indexed to, uint value, bytes data);
    event Confirmation(uint indexed txnId, address indexed sender);
    event Revocation(uint indexed txnId, address indexed sender);
    event Execution(uint indexed transactionId);
    event ExecutionFailure(uint indexed transactionId);
    event OwnerAdded(address indexed owner);
    event OwnerRemoved(address indexed owner);
    event RequirementChange(uint required);

	// storage
	mapping (uint => Transaction) public txns; // transaction id -> transaction
	mapping (uint => mapping (address => bool)) public confirmations; // txn id -> owner -> bool confirmation
	mapping (address => bool) public isOwner; // address -> bool isOwner
	address[] public owners;
	uint public required;
	uint public txnCount;
  uint public numOwners;
	struct Transaction {
		address to;
		uint value;
		bytes data;
		bool executed;
		uint numConfirmations;
	}

	// modifiers
	modifier onlyWallet() {
		require(msg.sender == address(this), "Not the wallet");
		_;
	}

	modifier ownerExists(address _owner) {
		require(isOwner[_owner], "Not an owner");
		_;
	}

  modifier ownerDoesNotExist(address _owner) {
    require(!isOwner[_owner], "Owner already exists");
    _;
  }
	
	modifier txnExists(uint _txnId) {
		require(_txnId < txnCount, "Txn does not exist");
		_;
	}

	modifier txnNotExists(uint _txnId) {
		require(_txnId >= txnCount, "Txn already exists");
		_;
	}

	modifier confirmed(uint _txnId, address _owner) {
		require(confirmations[_txnId][_owner], "Txn not confirmed");
		_;
	}
	
	modifier notConfirmed(uint _txnId, address _owner) {
		require(!confirmations[_txnId][_owner], "Txn already confirmed");
		_;
	}

	modifier notExecuted(uint _txnId) {
		require(!txns[_txnId].executed, "Txn already executed");
		_;
	}

	modifier notNull(address _address) {
		require(_address != address(0), "Address is null");
		_;
	}
	
	modifier validRequirement(uint _ownerCount, uint _required) {
		require(_required <= _ownerCount
			&& _required != 0
			&& _ownerCount != 0,
			"Invalid requirement");
		_;
	}

	// receive function allows plain eth deposits
	receive() external payable {
		if (msg.value > 0)
			emit Deposit(msg.sender, msg.value, address(this).balance);
	}

	// constructor
	constructor(address[] memory _owners, uint _required) validRequirement(_owners.length, _required){
		for (uint i = 0; i < _owners.length; i++) {
			address owner = _owners[i];

			require(!isOwner[owner], "Owner already exists");
			require(owner != address(0), "Address is null");
			isOwner[owner] = true;
		}
		owners = _owners;
		required = _required;
    numOwners = _owners.length;
	}

	// @dev Allows an owner to submit a transaction to the wallet
	function submitTxn(address _to, uint _value, bytes memory _data) public ownerExists(msg.sender) returns (uint _txnId) {
		// adds txn submission to the transaction history
		_txnId = addTxn(_to, _value, _data);
		confirmTxn(_txnId);
	}

	// @dev Internal function to add a new transaction to the transaction mapping
	function addTxn(address _to, uint _value, bytes memory _data) internal notNull(_to) returns (uint _txnId) {
		_txnId = txnCount;
		txns[_txnId] = Transaction({
			to: _to,
			value: _value,
			data: _data,
			executed: false,
			numConfirmations: 0
		});
		txnCount += 1;
		emit Submission(_txnId, msg.sender, _to, _value, _data);
	}

	// @dev Lets an owner confirm a transaction
	function confirmTxn(uint _txnId) public ownerExists(msg.sender) txnExists(_txnId) notConfirmed(_txnId, msg.sender) {
		Transaction storage txn = txns[_txnId];
		txn.numConfirmations += 1;
		confirmations[_txnId][msg.sender] = true;

		emit Confirmation(_txnId, msg.sender);
		executeTxn(_txnId);
	}

	// @dev Revokes a confirmation of a transaction
	function revokeConfirmation(uint _txnId) public ownerExists(msg.sender) txnExists(_txnId) confirmed(_txnId, msg.sender) {
		Transaction storage txn = txns[_txnId];
		txn.numConfirmations -= 1;
		confirmations[_txnId][msg.sender] = false;

		emit Revocation(_txnId, msg.sender);
	}

	// @dev Executes a transaction
	function executeTxn(uint _txnId) public ownerExists(msg.sender) confirmed(_txnId, msg.sender) notExecuted(_txnId) {
		if (isConfirmed(_txnId)) {
			Transaction storage txn = txns[_txnId];
			(bool success, ) = txn.to.call{value: txn.value}(txn.data);
			if (success) {
				txn.executed = true;
				emit Execution(_txnId);
			} else {
				txn.executed = false;
				emit ExecutionFailure(_txnId);
			}
		}
	}
	
	// @dev Returns true if a transaction is confirmed the required number of times
	function isConfirmed(uint _txnId) public view returns (bool) {
		uint count = 0;
		for (uint i = 0; i < owners.length; i++) {
			if (confirmations[_txnId][owners[i]])
				count += 1;
			if (count >= required)
				return true;
		}
		return false;  // Explicitly return false if not confirmed
	}
  
	// @dev Adds an owner to the wallet
	function addOwner(address _newOwner) public onlyWallet ownerDoesNotExist(_newOwner) notNull(_newOwner) validRequirement(owners.length + 1, required) {
    isOwner[_newOwner] = true;
    owners.push(_newOwner);
    numOwners += 1;
    emit OwnerAdded(_newOwner);
  }

	// @dev Removes an owner from the wallet
	function removeOwner(address _ownerToRemove) public onlyWallet ownerExists(_ownerToRemove) validRequirement(owners.length - 1, required) {
    isOwner[_ownerToRemove] = false;
    for (uint i = 0; i < owners.length; i++) {
      if (owners[i] == _ownerToRemove) {
        owners[i] = owners[owners.length - 1];
        owners.pop();
        break;
      }
    }
    numOwners -= 1;
    emit OwnerRemoved(_ownerToRemove);
  }

	// @dev Changes the required number of confirmations
	function changeRequirement(uint _required) public onlyWallet validRequirement(owners.length, _required) {
    required = _required;
    emit RequirementChange(required);
  }

	// view functions
	
	// @dev Returns all the owners
	// @return List of owner addresses
	function getOwners() public view returns (address[] memory){
		return owners;
	}
	
	// @dev Returns the number of confirmations of a txn id
	// @param _txnId The transaction id
	// @return count The number of confirmations
	function getConfirmationCount(uint _txnId) public view returns (uint count) {
		count = 0;
		for (uint i = 0; i < owners.length; i++)
			if (confirmations[_txnId][owners[i]])
				count++;
	}

	// @param pending Inlcude pendings txns
	// @param executed Include executed txns
	function getTransactionCount(bool pending, bool executed) public view returns (uint count) {
		for (uint i = 0; i < txnCount; i++) {
			if (pending && !txns[i].executed
				|| executed && txns[i].executed)
				count += 1;
		}
		return count;
	}
	
	// @dev Returns all the addresses that have confirmed the transaction
	// @param _txnId The transaction id
	// @return _confirmations The addresses that have confirmed the transaction
	function getConfirmations(uint _txnId) public view returns (address[] memory _confirmations) {
		address[] memory confirmationsTemp = new address[](owners.length);
		uint count = 0;
		uint i;
		// loops through owners and counts the number of confirmations for the txn
		for (i = 0; i < owners.length; i++)
			if (confirmations[_txnId][owners[i]]) {
				confirmationsTemp[count] = owners[i];
				count += 1;
			}
		
		_confirmations = new address[](count);
		// adds addresses who have confirmed the txn to the new array
		for (i = 0; i < count; i++)
			_confirmations[i] = confirmationsTemp[i];
	}

	// @dev Returns all the transaction ids in the range
	// @param from Index start position of txn array
	// @param to Index end position of txn array
	// @param pending Include pending transactions
	// @param executed Include executed transactions
	// @return _txnIds The transaction ids
	function getTransactionIds(uint from, uint to, bool pending, bool executed) public view returns (uint[] memory _txnIds) {
		require(from < to, "Invalid range");

		// prevent out of bounds access in for loop
		if (to > txnCount)
			to = txnCount;

		uint[] memory txnIdsTemp = new uint[](to - from);
		uint count = 0;
		uint i;
		// loops through txns and adds filtered txns to txnIdsTemp
		for (i = from; i < to; i++) {
			if (pending && !txns[i].executed
				|| executed && txns[i].executed) {
				txnIdsTemp[count] = i;
				count += 1;
			}
		}
		_txnIds = new uint[](count);
		// adds filtered txns to the new array
		for (i = 0; i < count; i++)
			_txnIds[i] = txnIdsTemp[i];
	}
}
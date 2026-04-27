// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "forge-std/console.sol";

contract PickupRewardToken is ERC20, Ownable {
    constructor() ERC20("LogiChain Reward", "LGT") Ownable(msg.sender) {}

    function mint(address account, uint256 amount) external onlyOwner {
        _mint(account, amount);
    }
}

contract PickupScheduler is Ownable {
    enum Status {
        Pending,
        Confirmed,
        InTransit,
        Completed,
        Canceled
    }

    enum VehicleType {
        Bike,
        Car,
        Truck
    }

    struct Pickup {
        uint256 id;
        address requester;
        string pickupLocation;
        string dropoffLocation;
        string details;
        string packageSize;
        bool fragile;
        VehicleType requiredVehicleType;
        uint256 scheduledAt;
        address agent;
        Status status;
        bool rewardMinted;
        uint8 agentRating; // 1-5 stars, 0 means not rated
    }

    uint256 public nextPickupId;
    mapping(uint256 => Pickup) private pickups;
    mapping(address => uint256[]) public pickupsByUser;
    mapping(address => uint256) public rewardPoints;

    mapping(address => VehicleType) public agentVehicleType;
    mapping(address => bool) public hasVehicleType;

    // Agent rating system
    mapping(address => uint256) public agentTotalRating; // Sum of all ratings
    mapping(address => uint256) public agentRatingCount; // Number of ratings received

    PickupRewardToken public rewardToken;

    event PickupRequested(uint256 indexed pickupId, address indexed requester);
    event PickupConfirmed(uint256 indexed pickupId, address indexed agent);
    event PickupCompleted(uint256 indexed pickupId, address indexed agent);
    event PickupCanceled(uint256 indexed pickupId);
    event AgentRated(uint256 indexed pickupId, address indexed agent, uint8 rating);
    event AgentVehicleTypeSet(address indexed agent, VehicleType vehicleType);

    constructor(PickupRewardToken token) Ownable(msg.sender) {
        rewardToken = token;
    }

    function requestPickup(
        string memory pickupLocation,
        string memory dropoffLocation,
        string memory details,
        string memory packageSize,
        bool fragile,
        VehicleType requiredVehicleType,
        uint256 scheduledAt
    ) external returns (uint256) {
        require(bytes(pickupLocation).length > 0, "pickup required");
        require(bytes(dropoffLocation).length > 0, "dropoff required");
        require(scheduledAt > block.timestamp, "schedule future time");

        uint256 pickupId = ++nextPickupId;
        pickups[pickupId] = Pickup({
            id: pickupId,
            requester: msg.sender,
            pickupLocation: pickupLocation,
            dropoffLocation: dropoffLocation,
            details: details,
            packageSize: packageSize,
            fragile: fragile,
            requiredVehicleType: requiredVehicleType,
            scheduledAt: scheduledAt,
            agent: address(0),
            status: Status.Pending,
            rewardMinted: false,
            agentRating: 0
        });

        pickupsByUser[msg.sender].push(pickupId);

        emit PickupRequested(pickupId, msg.sender);
        return pickupId;
    }

    function confirmPickup(uint256 pickupId) external {
        Pickup storage p = pickups[pickupId];
        require(p.id == pickupId, "not found");
        require(p.status == Status.Pending, "not pending");
        require(p.requester != msg.sender, "requester can\'t confirm");

        p.agent = msg.sender;
        p.status = Status.Confirmed;

        emit PickupConfirmed(pickupId, msg.sender);
    }

    function setAgentVehicleType(VehicleType vehicleType) external {
        agentVehicleType[msg.sender] = vehicleType;
        hasVehicleType[msg.sender] = true;
        emit AgentVehicleTypeSet(msg.sender, vehicleType);
    }

    function markInTransit(uint256 pickupId) external {
        Pickup storage p = pickups[pickupId];
        require(p.agent == msg.sender, "only agent");
        require(p.status == Status.Confirmed, "not confirmed");

        p.status = Status.InTransit;
    }

    function completePickup(uint256 pickupId) external {
        Pickup storage p = pickups[pickupId];
        require(p.agent == msg.sender, "only agent");
        require(p.status == Status.InTransit, "not in transit");

        p.status = Status.Completed;

        uint256 buyerPoints = 10;
        uint256 agentPoints = 20;

        rewardPoints[p.requester] += buyerPoints;
        rewardPoints[p.agent] += agentPoints;

        if (!p.rewardMinted) {
            rewardToken.mint(p.requester, 1 ether);
            rewardToken.mint(p.agent, 1 ether);
            p.rewardMinted = true;
        }

        emit PickupCompleted(pickupId, msg.sender);
    }

    function cancelPickup(uint256 pickupId) external {
        Pickup storage p = pickups[pickupId];
        require(p.requester == msg.sender, "only requester");
        require(p.status == Status.Pending || p.status == Status.Confirmed, "cannot cancel");

        p.status = Status.Canceled;
        emit PickupCanceled(pickupId);
    }

    function rateAgent(uint256 pickupId, uint8 rating) external {
        require(rating >= 1 && rating <= 5, "rating must be 1-5");

        Pickup storage p = pickups[pickupId];
        require(p.id == pickupId, "pickup not found");
        require(p.status == Status.Completed, "pickup not completed");
        require(p.requester == msg.sender, "only requester can rate");
        require(p.agentRating == 0, "already rated");
        require(p.agent != address(0), "no agent assigned");

        p.agentRating = rating;
        agentTotalRating[p.agent] += rating;
        agentRatingCount[p.agent] += 1;

        emit AgentRated(pickupId, p.agent, rating);
    }

    function getPickupsByUser(address user) external view returns (uint256[] memory) {
        return pickupsByUser[user];
    }

    function getPendingPickupsByVehicleType(VehicleType vehicleType) public view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 1; i <= nextPickupId; i++) {
            Pickup memory p = pickups[i];
            if (p.status == Status.Pending && p.agent == address(0) && p.requiredVehicleType == vehicleType) {
                count++;
            }
        }

        uint256[] memory ids = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 1; i <= nextPickupId; i++) {
            Pickup memory p = pickups[i];
            if (p.status == Status.Pending && p.agent == address(0) && p.requiredVehicleType == vehicleType) {
                ids[idx++] = i;
            }
        }
        return ids;
    }

    function getAvailablePickupsForAgent() external view returns (uint256[] memory) {
        require(hasVehicleType[msg.sender], "agent vehicle type not set");
        return getPendingPickupsByVehicleType(agentVehicleType[msg.sender]);
    }

    function getPickupSummary(uint256 pickupId)
        external
        view
        returns (
            address requester,
            address agent,
            Status status,
            bool rewardMinted,
            uint8 agentRating,
            string memory pickupLocation,
            string memory dropoffLocation,
            string memory details,
            string memory packageSize,
            bool fragile,
            VehicleType requiredVehicleType,
            uint256 scheduledAt
        )
    {
        Pickup memory p = pickups[pickupId];
        require(p.id == pickupId, "pickup not found");
        return (
            p.requester,
            p.agent,
            p.status,
            p.rewardMinted,
            p.agentRating,
            p.pickupLocation,
            p.dropoffLocation,
            p.details,
            p.packageSize,
            p.fragile,
            p.requiredVehicleType,
            p.scheduledAt
        );
    }

    // Leaderboard functions
    function getTopAgentsByPoints(uint256 limit) external view returns (address[] memory, uint256[] memory) {
        address[] memory agents = new address[](limit);
        uint256[] memory points = new uint256[](limit);
        uint256 count = 0;

        for (uint256 i = 1; i <= nextPickupId && count < limit; i++) {
            address agentAddress = pickups[i].agent;
            if (agentAddress != address(0) && rewardPoints[agentAddress] > 0) {
                bool exists = false;
                for (uint256 j = 0; j < count; j++) {
                    if (agents[j] == agentAddress) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    agents[count] = agentAddress;
                    points[count] = rewardPoints[agentAddress];
                    count++;
                }
            }
        }

        address[] memory finalAgents = new address[](count);
        uint256[] memory finalPoints = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            finalAgents[i] = agents[i];
            finalPoints[i] = points[i];
        }

        return (finalAgents, finalPoints);
    }

    function getTopUsersByPoints(uint256 limit) external view returns (address[] memory, uint256[] memory) {
        address[] memory users = new address[](limit);
        uint256[] memory points = new uint256[](limit);
        uint256 count = 0;

        for (uint256 i = 1; i <= nextPickupId && count < limit; i++) {
            Pickup memory p = pickups[i];
            if (p.requester != address(0) && rewardPoints[p.requester] > 0) {
                bool found = false;
                for (uint256 j = 0; j < count; j++) {
                    if (users[j] == p.requester) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    users[count] = p.requester;
                    points[count] = rewardPoints[p.requester];
                    count++;
                }
            }
        }

        // Trim arrays
        address[] memory finalUsers = new address[](count);
        uint256[] memory finalUserPoints = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            finalUsers[i] = users[i];
            finalUserPoints[i] = points[i];
        }

        return (finalUsers, finalUserPoints);
    }

    function getCompletedPickupsByAgent(address agent) external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 1; i <= nextPickupId; i++) {
            if (pickups[i].agent == agent && pickups[i].status == Status.Completed) {
                count++;
            }
        }
        return count;
    }

    function getTotalRewardPoints(address user) external view returns (uint256) {
        return rewardPoints[user];
    }

    // Agent rating functions
    function getAgentAverageRating(address agent) external view returns (uint256) {
        if (agentRatingCount[agent] == 0) return 0;
        return agentTotalRating[agent] * 100 / agentRatingCount[agent]; // Return as percentage (e.g., 450 = 4.5 stars)
    }

    function getAgentRatingStats(address agent)
        external
        view
        returns (uint256 totalRating, uint256 ratingCount, uint256 averageRating)
    {
        totalRating = agentTotalRating[agent];
        ratingCount = agentRatingCount[agent];
        averageRating = ratingCount > 0 ? (totalRating * 100) / ratingCount : 0;
    }

    function getTopRatedAgents(uint256 limit) external view returns (address[] memory, uint256[] memory) {
        address[] memory agents = new address[](limit);
        uint256[] memory ratings = new uint256[](limit);
        uint256 count = 0;

        for (uint256 i = 1; i <= nextPickupId && count < limit; i++) {
            address agentAddress = pickups[i].agent;
            if (agentAddress != address(0) && agentRatingCount[agentAddress] > 0) {
                bool exists = false;
                for (uint256 j = 0; j < count; j++) {
                    if (agents[j] == agentAddress) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    agents[count] = agentAddress;
                    ratings[count] = this.getAgentAverageRating(agentAddress);
                    count++;
                }
            }
        }

        address[] memory finalAgents = new address[](count);
        uint256[] memory finalRatings = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            finalAgents[i] = agents[i];
            finalRatings[i] = ratings[i];
        }

        return (finalAgents, finalRatings);
    }
}

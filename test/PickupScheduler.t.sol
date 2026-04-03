// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../src/PickupScheduler.sol";

contract PickupSchedulerTest is Test {
    PickupRewardToken token;
    PickupScheduler scheduler;
    address requester = address(0x123);
    address agent = address(0x456);

    function setUp() public {
        token = new PickupRewardToken();
        scheduler = new PickupScheduler(token);
        token.transferOwnership(address(scheduler));

        vm.deal(requester, 10 ether);
        vm.deal(agent, 10 ether);
    }

    function testRequestPickup() public {
        vm.prank(requester);
        uint256 pickupId = scheduler.requestPickup("A", "B", "Box", block.timestamp + 1 hours);

        (uint256 id, address requester_, string memory pickupLocation, string memory dropoffLocation, string memory details, uint256 scheduledAt, address assignedAgent, PickupScheduler.Status status, bool rewardMinted, uint8 agentRating) = scheduler.pickups(pickupId);
        assertEq(id, pickupId);
        assertEq(requester_, requester);
        assertEq(assignedAgent, address(0));
        assertEq(uint256(status), uint256(PickupScheduler.Status.Pending));
        assertEq(agentRating, 0);

        uint256[] memory userPickups = scheduler.getPickupsByUser(requester);
        assertEq(userPickups.length, 1);
        assertEq(userPickups[0], pickupId);
    }

    function testConfirmAndCompleteFlow() public {
        vm.prank(requester);
        uint256 pickupId = scheduler.requestPickup("A", "B", "Box", block.timestamp + 1 hours);

        vm.prank(agent);
        scheduler.confirmPickup(pickupId);

        vm.prank(agent);
        scheduler.markInTransit(pickupId);

        vm.prank(agent);
        scheduler.completePickup(pickupId);

        (, , , , , , address assignedAgent, PickupScheduler.Status status, bool rewardMinted, uint8 agentRating) = scheduler.pickups(pickupId);
        assertEq(assignedAgent, agent);
        assertEq(uint256(status), uint256(PickupScheduler.Status.Completed));
        assertTrue(rewardMinted);
        assertEq(agentRating, 0); // Not rated yet

        assertEq(scheduler.rewardPoints(requester), 10);
        assertEq(scheduler.rewardPoints(agent), 20);

        assertEq(token.balanceOf(requester), 1 ether);
        assertEq(token.balanceOf(agent), 1 ether);
    }

    function testLeaderboardFunctions() public {
        address agent2 = address(0x789);
        address requester2 = address(0xABC);
        vm.deal(agent2, 10 ether);
        vm.deal(requester2, 10 ether);

        // Create multiple pickups
        vm.prank(requester);
        uint256 pickup1 = scheduler.requestPickup("A", "B", "Box1", block.timestamp + 1 hours);

        vm.prank(requester2);
        uint256 pickup2 = scheduler.requestPickup("C", "D", "Box2", block.timestamp + 1 hours);

        vm.prank(requester);
        uint256 pickup3 = scheduler.requestPickup("E", "F", "Box3", block.timestamp + 1 hours);

        // Confirm and complete pickups
        vm.prank(agent);
        scheduler.confirmPickup(pickup1);
        vm.prank(agent);
        scheduler.markInTransit(pickup1);
        vm.prank(agent);
        scheduler.completePickup(pickup1);

        vm.prank(agent2);
        scheduler.confirmPickup(pickup2);
        vm.prank(agent2);
        scheduler.markInTransit(pickup2);
        vm.prank(agent2);
        scheduler.completePickup(pickup2);

        vm.prank(agent);
        scheduler.confirmPickup(pickup3);
        vm.prank(agent);
        scheduler.markInTransit(pickup3);
        vm.prank(agent);
        scheduler.completePickup(pickup3);

        // Test leaderboard functions
        (address[] memory topAgents, uint256[] memory agentPoints) = scheduler.getTopAgentsByPoints(10);
        assertEq(topAgents.length, 2); // agent and agent2
        assertEq(agentPoints.length, 2);

        // Agent should have more points (40) than agent2 (20)
        if (topAgents[0] == agent) {
            assertEq(agentPoints[0], 40);
            assertEq(agentPoints[1], 20);
        } else {
            assertEq(agentPoints[0], 20);
            assertEq(agentPoints[1], 40);
        }

        (address[] memory topUsers, uint256[] memory userPoints) = scheduler.getTopUsersByPoints(10);
        assertEq(topUsers.length, 2); // requester and requester2
        assertEq(userPoints.length, 2);

        // Requester should have more points (20) than requester2 (10)
        if (topUsers[0] == requester) {
            assertEq(userPoints[0], 20);
            assertEq(userPoints[1], 10);
        } else {
            assertEq(userPoints[0], 10);
            assertEq(userPoints[1], 20);
        }

        // Test individual functions
        assertEq(scheduler.getCompletedPickupsByAgent(agent), 2);
        assertEq(scheduler.getCompletedPickupsByAgent(agent2), 1);
        assertEq(scheduler.getTotalRewardPoints(requester), 20);
        assertEq(scheduler.getTotalRewardPoints(requester2), 10);
    }

    function testAgentRatingSystem() public {
        address agent2 = address(0x789);
        address requester2 = address(0xABC);
        vm.deal(agent2, 10 ether);
        vm.deal(requester2, 10 ether);

        // Create and complete two pickups
        vm.prank(requester);
        uint256 pickup1 = scheduler.requestPickup("A", "B", "Box1", block.timestamp + 1 hours);

        vm.prank(requester2);
        uint256 pickup2 = scheduler.requestPickup("C", "D", "Box2", block.timestamp + 1 hours);

        // Agent confirms and completes pickup1
        vm.prank(agent);
        scheduler.confirmPickup(pickup1);
        vm.prank(agent);
        scheduler.markInTransit(pickup1);
        vm.prank(agent);
        scheduler.completePickup(pickup1);

        // Agent2 confirms and completes pickup2
        vm.prank(agent2);
        scheduler.confirmPickup(pickup2);
        vm.prank(agent2);
        scheduler.markInTransit(pickup2);
        vm.prank(agent2);
        scheduler.completePickup(pickup2);

        // Requester rates agent 5 stars
        vm.prank(requester);
        scheduler.rateAgent(pickup1, 5);

        // Requester2 rates agent2 4 stars
        vm.prank(requester2);
        scheduler.rateAgent(pickup2, 4);

        // Check ratings
        (uint256 totalRating, uint256 ratingCount, uint256 averageRating) = scheduler.getAgentRatingStats(agent);
        assertEq(totalRating, 5);
        assertEq(ratingCount, 1);
        assertEq(averageRating, 500); // 5.00 * 100

        (totalRating, ratingCount, averageRating) = scheduler.getAgentRatingStats(agent2);
        assertEq(totalRating, 4);
        assertEq(ratingCount, 1);
        assertEq(averageRating, 400); // 4.00 * 100

        // Test top rated agents
        (address[] memory topAgents, uint256[] memory ratings) = scheduler.getTopRatedAgents(10);
        console.log("topAgents.length:", topAgents.length);
        console.log("ratings.length:", ratings.length);
        if (topAgents.length > 0) {
            console.log("topAgents[0]:", topAgents[0]);
            console.log("ratings[0]:", ratings[0]);
        }
        if (topAgents.length > 1) {
            console.log("topAgents[1]:", topAgents[1]);
            console.log("ratings[1]:", ratings[1]);
        }
        assertEq(topAgents.length, 2);
        assertEq(ratings.length, 2);

        // Agent should be first (5 stars) then agent2 (4 stars)
        assertEq(topAgents[0], agent);
        assertEq(ratings[0], 500);
        assertEq(topAgents[1], agent2);
        assertEq(ratings[1], 400);

        // Test rating validation
        vm.prank(requester);
        vm.expectRevert("already rated");
        scheduler.rateAgent(pickup1, 3); // Try to rate again

        vm.prank(requester);
        vm.expectRevert("rating must be 1-5");
        scheduler.rateAgent(pickup1, 6); // Invalid rating

        // Test pickup struct has rating
        (,,,,,,address assignedAgent,,bool rewardMinted,uint8 agentRating) = scheduler.pickups(pickup1);
        assertEq(agentRating, 5);
        assertEq(assignedAgent, agent);
        assertTrue(rewardMinted);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {PickupRewardToken} from "../src/PickupScheduler.sol";
import {PickupScheduler} from "../src/PickupScheduler.sol";

contract DeployPickupScheduler is Script {
    function run() external {
        vm.startBroadcast();

        PickupRewardToken token = new PickupRewardToken();
        PickupScheduler scheduler = new PickupScheduler(token);
        token.transferOwnership(address(scheduler));

        console.log("PickupRewardToken deployed to:", address(token));
        console.log("PickupScheduler deployed to:", address(scheduler));

        vm.stopBroadcast();
    }
}
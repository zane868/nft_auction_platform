// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

contract MetaNFT is ERC721Enumerable {
    uint256 private _nextId = 1;

    constructor() ERC721("MetaNFT", "MNFT") {}

    function mint(address to) external returns (uint) {
        uint id = _nextId;
        _safeMint(to, id);
        _nextId++;
        return id;
    }

    function burn(uint id) external {
        require(_msgSender() == ownerOf(id), "not owner");
        _burn(id);
    }

    //用户查看属于自己的NFTID
    function GetTokenIdsOfOwner() external view returns (uint[] memory) {
        address owner = _msgSender();
        uint count = balanceOf(owner);
        uint256[] memory ids = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            ids[i] = tokenOfOwnerByIndex(owner, i);
        }
        return ids;
    }
}
